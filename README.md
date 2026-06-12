# AutoHub — Car Store + Ory Kratos

A demo car store (React + Vite frontend, Express + TypeScript backend) with
authentication handled entirely by **Ory Kratos**, running in Docker with
PostgreSQL.

**Sign-in: username + password** (Ory Kratos). After signing in, a user can
browse and reserve cars. To **schedule a visit to the seller**, they connect
their **Google** account once — a backend-owned OAuth flow with **offline
access** that returns a **refresh token** (stored on the Kratos identity under
`metadata_admin`). The app then creates a 30-minute event in their Google
Calendar and can refresh the token silently afterwards.

Google is **not** a login method here — it's connected on demand, only when the
user chooses to schedule a visit.

Everything runs with a single `docker compose up`.

---

## Architecture

| Service          | Port  | Description                                            |
| ---------------- | ----- | ------------------------------------------------------ |
| `frontend`       | 3000  | React + Vite SPA — store UI **and** the auth flow UI   |
| `backend`        | 4000  | Express API — car catalog + protected orders           |
| `kratos`         | 4433  | Ory Kratos public API (4434 = admin API)               |
| `kratos-admin-ui`| 5173  | Web UI to manage identities (reads the admin API)      |
| `postgres`       | 5432* | Kratos database (*not published to the host)           |
| `kratos-config`  | —     | Init container: renders `kratos.yml` from `.env`       |
| `kratos-migrate` | —     | Runs DB migrations once, then exits                    |

The frontend uses the **bring-your-own-UI** pattern: it initializes Kratos
*browser* self-service flows and renders `flow.ui` as native HTML forms that
POST directly back to Kratos. Kratos manages the session cookie; the backend
authorizes requests by calling Kratos `whoami` with the forwarded cookie.

```
Browser ──> frontend :3000 ──(flows)──> Kratos :4433 ──> Postgres
   │                                         ▲
   └────── API calls (cookie) ──> backend :4000 ──(whoami)──┘
```

---

## 1. Prerequisites

- Docker + Docker Compose v2 (`docker compose version`)
- A Google Cloud OAuth client, configured per the steps below.

## 2. Configure Google (OAuth + Calendar)

In the [Google Cloud Console](https://console.cloud.google.com/):

1. **Enable the Google Calendar API** for your project
   (APIs & Services → Library → "Google Calendar API" → Enable).
2. On the **OAuth consent screen**, add the scope
   `https://www.googleapis.com/auth/calendar.events` (alongside the default
   `email` / `profile`). While the app is in **Testing** mode, add your own
   Google account under **Test users** so the sensitive Calendar scope works
   without Google verification.
3. In your **OAuth client**, add this **Authorized redirect URI** (used by the
   backend's connect-Google flow):

   `http://localhost:4000/api/google/calendar/callback`

   (Login no longer uses Google, so the old Kratos `…/callback/google`
   redirect URI is not required — it's harmless if you leave it.)

Credentials are already filled into `.env`. Edit `.env` to change them.

> Calendar access is requested **only when a user connects Google** (from the
> Schedule-visit dialog), using offline access so Google returns a refresh
> token. If a connect attempt reports `norefresh`, remove the app at
> myaccount.google.com → Security → Third-party access and connect again so
> Google re-issues a refresh token.

<details>
<summary>Old note (Yandex — no longer used)</summary>

> Yandex returns only an `access_token` (no `id_token`),
> so Kratos calls the Yandex userinfo endpoint and maps the result via
> `kratos/oidc/yandex.jsonnet`. Make sure the Yandex app has the
> `login:email` and `login:info` permissions enabled.

</details>

## 3. Run

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

First boot ordering is handled automatically: `kratos-config` renders the
config → `kratos-migrate` runs migrations → `kratos` serves → `backend` →
`frontend`.

## 4. Try it

1. Click **Sign up**, choose a **username + password**, and you're signed in
   (Kratos creates the identity and a session).
2. Click **Schedule visit** on any car. If you haven't connected Google yet,
   the dialog shows **Connect Google Calendar** — this is the on-demand OAuth
   consent (offline access → refresh token, stored on your Kratos identity).
3. After connecting, pick a date & time and confirm. The backend refreshes the
   token and creates a **30-minute event in your Google Calendar**
   ("Visit seller — Make Model"), returning a link to open it.
4. **Reserve** is a separate protected action (`POST /api/orders`) that needs
   only a valid Kratos session — no Google required.

### Admin UI

Open **http://localhost:5173** for the Kratos Admin UI — a web interface to
list, search, view, create, edit, delete, and recover identities. It runs on
the internal Docker network and talks to the Kratos admin API by service name,
so the admin API itself stays unexposed.

> Like the admin API, the Admin UI is **unauthenticated** — it's for local
> development only. Don't deploy it publicly without putting auth in front of it.

### How the Calendar integration works

Login and calendar access are **separate** on purpose. Kratos's login token is
captured once at sign-up and never refreshed, so it can't sustain API calls.
Instead:

1. **Login** uses Google with only `email` + `profile` scopes (via Kratos).
2. **Connect Google Calendar** is a backend-owned OAuth flow
   (`/api/google/calendar/connect` → Google consent → `/callback`) that requests
   the `calendar.events` scope with `access_type=offline` + `prompt=consent`, so
   Google returns a **refresh token**.
3. The backend stores that refresh token on the Kratos identity via the Admin
   API (`PATCH /admin/identities/{id}`, under `metadata_admin.google_calendar`).
4. When you schedule a visit, the backend reads the refresh token, mints a fresh
   access token, and `POST`s the event to the Google Calendar API.

> Email/password, Yandex, verification, and recovery are **disabled** in this
> build (Google-only). The `SMTP_*` values in `.env` are therefore unused; the
> Yandex jsonnet mapper is left in place but inactive.

---

## Backend API

| Method | Path             | Auth        | Description                  |
| ------ | ---------------- | ----------- | ---------------------------- |
| GET    | `/api/me`        | optional    | Current session / identity   |
| GET    | `/api/cars`      | public      | List cars                    |
| GET    | `/api/cars/:id`  | public      | Car detail                   |
| POST   | `/api/orders`    | **session** | Reserve a car                |
| GET    | `/api/orders`    | **session** | List the user's reservations |
| GET    | `/api/google/calendar/status`  | **session** | Is the user's calendar connected? |
| GET    | `/api/google/calendar/connect` | **session** | Start the Google Calendar consent flow |
| GET    | `/api/google/calendar/callback`| public  | OAuth callback (state-validated) |
| POST   | `/api/visits`    | **session** | Create a 30-min Google Calendar visit event |

Orders are stored in memory and reset when the backend restarts (demo only).

---

## Configuration reference

- **`.env`** — all secrets and ports. Real OAuth + SMTP credentials live here.
  - `KRATOS_CIPHER_SECRET` **must be exactly 32 characters**;
    `KRATOS_COOKIE_SECRET` must be at least 16.
- **`kratos/kratos.yml.tmpl`** — Kratos config template. `${VARS}` are
  substituted from `.env` by the `kratos-config` init container (it also
  URL-encodes the `@` in the SMTP user for the connection URI).
- **`kratos/identity.schema.json`** — identity traits (email as the login
  identifier, optional first/last name; email is verifiable + recoverable).
- **`kratos/oidc/*.jsonnet`** — claim → identity mappers for Google and Yandex.

### Changing ports / origins

The app assumes the frontend on `http://localhost:3000`. If you change it,
update `CLIENT_ORIGIN` in `.env` (used for CORS, return URLs, and all Kratos
self-service UI URLs) and the published ports in `docker-compose.yml`.

---

## Running the apps locally (without Docker)

Kratos + Postgres can stay in Docker while you iterate on the apps:

```bash
docker compose up postgres kratos-config kratos-migrate kratos
# backend
cd backend && npm install && npm run dev
# frontend (separate terminal)
cd frontend && npm install && npm run dev
```

> A `node_modules/` may already exist in `backend/` and `frontend/` from the
> initial type-check; it's git-ignored and ignored by Docker. Delete it freely.

---

## Troubleshooting

- **OIDC "redirect_uri_mismatch"** — the callback URL in the provider console
  must exactly match `http://localhost:4433/self-service/methods/oidc/callback/<provider>`.
- **No verification email** — check `docker compose logs -f kratos`; the code
  is logged there if SMTP delivery fails. Yandex SMTP requires an *app
  password* (already provided in `.env`).
- **Config didn't update** — the rendered config lives in a Docker volume.
  After editing `.env` or the template, rebuild that volume:
  `docker compose up -d --force-recreate kratos-config kratos`.
- **Reset everything** — `docker compose down -v` (the `-v` also wipes the
  Postgres + config volumes).
