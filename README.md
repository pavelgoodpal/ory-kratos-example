# AutoHub — Car Store + Ory Kratos

A demo car store (React + Vite frontend, Express + TypeScript backend) with
authentication handled entirely by **Ory Kratos**, running in Docker with
PostgreSQL.

**Sign-in: username + password** (Ory Kratos). After signing in, a user can
browse and reserve cars. To **schedule a visit to the seller**, they **link
their Google account through Kratos** — the "Link Google" button in Kratos's
**settings flow** (OIDC account linking). Kratos performs the Google OAuth and
stores the Google tokens (encrypted) in the identity's **`oidc` credential**.
The backend reads that token via the Kratos Admin API
(`?include_credential=oidc`) to create a 30-minute Calendar event.

Google is link-only (shown only on the Settings page), not a way to log in.

> **Refresh tokens via Kratos:** the Google provider includes the
> `offline_access` pseudo-scope, which makes Kratos add `access_type=offline` to
> the Google request. Google then returns a **refresh token**, which Kratos
> stores in the identity's `oidc` credential (`initial_refresh_token`). The
> backend uses it to mint fresh access tokens, so scheduling keeps working past
> the ~1-hour access-token lifetime — no constant re-linking. (Google only
> issues a refresh token on first consent, so if you linked *before* adding
> `offline_access`, revoke the app at myaccount.google.com → Security and link
> again.)

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
3. In your **OAuth client**, set the **Authorized redirect URI** to the Kratos
   OIDC callback (Kratos handles the Google OAuth for linking):

   `http://localhost:4433/self-service/methods/oidc/callback/google`

Credentials are already filled into `.env`. Edit `.env` to change them.

> Linking Google is done from the **Settings** page ("Link Google"). Because
> Kratos doesn't request offline access, the captured token lasts ~1 hour —
> re-link from Settings when scheduling reports that the link expired.

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
2. Open **Settings** and click **Link Google** (or click **Schedule visit** →
   **Go to Settings to link Google**). Kratos runs the Google consent (granting
   the Calendar scope) and stores the token in your identity's `oidc` credential.
3. Back on a car, click **Schedule visit**, pick a date & time, and confirm. The
   backend reads the linked token from Kratos and creates a **30-minute event in
   your Google Calendar** ("Visit seller — Make Model"), returning a link.
4. **Reserve** is a separate protected action (`POST /api/orders`) that needs
   only a valid Kratos session — no Google required.

> If scheduling says the Google link expired (~1 hour after linking), just
> **re-link Google** in Settings — see the limitation note at the top.

### Admin UI

Open **http://localhost:5173** for the Kratos Admin UI — a web interface to
list, search, view, create, edit, delete, and recover identities. It runs on
the internal Docker network and talks to the Kratos admin API by service name,
so the admin API itself stays unexposed.

> Like the admin API, the Admin UI is **unauthenticated** — it's for local
> development only. Don't deploy it publicly without putting auth in front of it.

### How the Calendar integration works (through Kratos)

1. **Login** is username + password (Kratos `password` method).
2. **Linking Google** uses Kratos's `oidc` method in the **settings flow**.
   Clicking "Link Google" runs the Google OAuth (scopes `email`, `profile`,
   `calendar.events`); Kratos attaches the provider to the identity and stores
   the Google tokens **encrypted** in the identity's `oidc` credential.
3. When you schedule a visit, the backend calls the **Kratos Admin API**
   (`GET /admin/identities/{id}?include_credential=oidc`), reads the stored
   `initial_access_token` for the `google` provider, and `POST`s the event to
   the Google Calendar API.
4. The `offline_access` scope makes Kratos request `access_type=offline`, so
   Google also returns a **refresh token** (stored as `initial_refresh_token`).
   When the ~1-hour access token expires, the backend refreshes it with that
   refresh token automatically — no re-link needed.

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
| GET    | `/api/google/calendar/status`  | **session** | Is Google linked to this identity? |
| POST   | `/api/visits`    | **session** | Create a 30-min Google Calendar visit event |

Google linking itself is handled by **Kratos** (settings flow → OIDC), not by a
backend route.

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
