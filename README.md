# AutoHub — Car Store + Ory Kratos

A demo car store (React + Vite frontend, Express + TypeScript backend) with
authentication handled entirely by **Ory Kratos**, running in Docker with
PostgreSQL.

**Sign-in: email + password + one-time email code (2FA).** Authentication is
handled entirely by Ory Kratos:

- **Registration** — email + password, then an emailed **one-time code (OTP)**
  to verify the address.
- **Login** — email + password (first factor), then an emailed **one-time code**
  as a required **second factor** on every login.

This uses Kratos's `password` method plus the `code` method as MFA
(`mfa_enabled: true`), with `session.whoami.required_aal: highest_available` so a
password-only session isn't fully authenticated until the code is entered.
Social sign-in (Google/OIDC) and the Google Calendar feature have been removed.

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
- Working **SMTP** so Kratos can email the one-time codes. `.env` is set up for
  Yandex SMTP; if SMTP can't send, Kratos prints the code to its logs instead
  (`docker compose logs -f kratos`).

## 2. Run

```bash
docker compose up --build
```

Then open **http://localhost:3000**.

First boot ordering is handled automatically: `kratos-config` renders the
config → `kratos-migrate` runs migrations → `kratos` serves → `backend` →
`frontend`.

## 3. Try it

1. Click **Sign up**, enter your **email + password**. Kratos emails a
   **one-time verification code** — enter it on the verification page to confirm
   your address.
2. Click **Sign in**, enter email + password. Kratos then emails a **one-time
   code** as the second factor — enter it to finish logging in.
3. Once logged in, **Reserve** a car — a protected `POST /api/orders` that
   succeeds only with a valid (AAL2) Kratos session.
4. Forgot your password? Use **Forgot password?** → recovery via an emailed code.

> Codes are emailed via the SMTP settings in `.env`. If delivery fails (or SMTP
> is blank), Kratos logs the code: `docker compose logs -f kratos`.

### Admin UI

Open **http://localhost:5173** for the Kratos Admin UI — a web interface to
list, search, view, create, edit, delete, and recover identities. It runs on
the internal Docker network and talks to the Kratos admin API by service name,
so the admin API itself stays unexposed.

> Like the admin API, the Admin UI is **unauthenticated** — it's for local
> development only. Don't deploy it publicly without putting auth in front of it.

### How the email OTP / 2FA works

1. **Registration** sets a `password` credential and triggers the **verification**
   flow (`use: code`) — Kratos emails a one-time code to confirm the address.
2. **Login** submits email + password (AAL1). Because the `code` method has
   `mfa_enabled: true` and the email is verified, Kratos then requires the
   **emailed code as a second factor** within the same login flow (AAL2).
3. `session.whoami.required_aal: highest_available` makes a password-only (AAL1)
   session count as *not fully authenticated*, so the backend's `whoami` check
   only accepts a session that completed the code step.
4. **Recovery** (`use: code`) lets a user reset a forgotten password via an
   emailed code.

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

A "session" here means a **fully authenticated (AAL2)** Kratos session — i.e.
password *and* the emailed code were completed.

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
  identifier and the code/recovery/verification address; optional name).
- **`kratos/oidc/*.jsonnet`** — leftover OIDC mappers (unused now that OIDC is
  disabled; safe to ignore or delete).

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

- **No email code arrives** — check `docker compose logs -f kratos`; the code is
  logged there if SMTP delivery fails. Yandex SMTP requires an *app password*
  (already provided in `.env`).
- **Login never asks for the code** — the email must be **verified** first
  (email-code MFA sends to a verifiable address). Complete the registration
  verification step, or check the identity's `verifiable_addresses` via the
  admin API.
- **Schema/identifier errors after switching to email** — old `username`
  identities don't match the new email schema. Reset with
  `docker compose down -v` then register fresh.
- **Config didn't update** — the rendered config lives in a Docker volume.
  After editing `.env` or the template, rebuild that volume:
  `docker compose up -d --force-recreate kratos-config kratos`.
- **Reset everything** — `docker compose down -v` (the `-v` also wipes the
  Postgres + config volumes).
