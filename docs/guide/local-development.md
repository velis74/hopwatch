# Local development

Hopwatch runs locally as four processes:

| Process | Address | Serves |
| --- | --- | --- |
| Django | `127.0.0.1:8100` | `/_allauth/` (allauth headless), `/accounts/` (social login callbacks), `/admin/` |
| FastAPI | `127.0.0.1:8101` | `/api/v1/` |
| Vite | `127.0.0.1:5180` | the Vue app; proxies `/api` to FastAPI and the other paths above to Django |
| MOTIS | `127.0.0.1:8180` | timetables and real-time data |

Open the app at <http://127.0.0.1:5180>. Django and FastAPI share the session cookie through the Vite proxy.

## Setup

Requirements: Python 3.13 or newer with [uv](https://docs.astral.sh/uv/), Node.js 22 or newer, Docker.

```sh
uv sync
npm ci
uv run python manage.py migrate
uv run python manage.py createsuperuser   # optional, for /admin/
```

The database is SQLite in `var/db.sqlite3`. `DATABASE_URL` selects another database, for example
`postgres://user:password@localhost/hopwatch`.

## MOTIS

MOTIS runs in Docker from the `motis/` directory. Downloading the feeds, importing them and starting the
server are described in
[motis/README.md](https://github.com/velis74/hopwatch/blob/main/motis/README.md).

## Running

```sh
scripts/dev.sh
```

The script applies migrations and starts Django, FastAPI (with reload) and Vite; Ctrl+C stops all three.
The API is documented at <http://127.0.0.1:8101/api/docs> (Swagger UI) and <http://127.0.0.1:8101/api/redoc>.

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | a development key | Django secret key; required when `DEBUG` is off |
| `DEBUG` | `true` | Django debug mode |
| `SECURE_COOKIES` | the opposite of `DEBUG` | send the session and CSRF cookies only over HTTPS |
| `BEHIND_TLS_PROXY` | `false` | trust `X-Forwarded-Proto: https` from the reverse proxy that terminates TLS |
| `ALLOWED_HOSTS` | `127.0.0.1,localhost` | comma-separated host names |
| `CSRF_TRUSTED_ORIGINS` | `http://127.0.0.1:5180,http://localhost:5180` | comma-separated origins |
| `FRONTEND_URL` | `http://127.0.0.1:5180` | base URL of the app, used in links that allauth generates |
| `DATABASE_URL` | SQLite in `var/db.sqlite3` | database URL |
| `MOTIS_URL` | `http://127.0.0.1:8180` | MOTIS API |
| `TIMETABLE_FEEDS` | `motis/data/gtfs` | comma-separated GTFS feeds that MOTIS loads (zip files or directories of them); `/api/v1/operators` lists the operators of their `agency.txt` and every operator an answer named since the API started |

### Social login

A provider appears on the login page only when all of its variables are set.

| Provider | Variables |
| --- | --- |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; optional `GOOGLE_MOBILE_CLIENT_IDS` (comma-separated native client IDs) |
| Apple | `APPLE_CLIENT_ID` (Services ID, optionally `,<bundle ID>`), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (PEM; `\n` escapes allowed) |

The mobile app logs in with the provider's native SDK and sends the ID token to
`/_allauth/app/v1/auth/provider/token`. The token's audience must be `GOOGLE_CLIENT_ID` or one of
`GOOGLE_MOBILE_CLIENT_IDS` for Google, and the Services ID or the bundle ID for Apple.

The redirect URIs to register with the provider are `http://127.0.0.1:5180/accounts/google/login/callback/` and
`http://127.0.0.1:5180/accounts/apple/login/callback/`. Apple does not accept `http` or IP addresses as return
URLs, so local Apple login needs an HTTPS tunnel whose host is added to `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`
and `FRONTEND_URL`.

## Checks

```sh
uv run ruff check . && uv run ruff format --check .
npm run lint
npm run build
npm run test:e2e   # needs scripts/dev.sh and MOTIS running
```
