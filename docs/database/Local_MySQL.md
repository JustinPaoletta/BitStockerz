# Local MySQL (Docker)

The BitStockerz API uses **MySQL 8** via Prisma. Database backing is **optional**: without `DATABASE_URL`, the API runs in in-memory seed mode (fine for unit/e2e tests and quick API exploration). Use MySQL when you want persisted jobs, ingested OHLCV bars, and symbol rows after import.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine
- Node.js `24.11.1` and npm (see root `README.md`)

## Quick start

From the repo root:

```bash
# 1. Start MySQL 8 in Docker (creates container + volume on first run)
./scripts/docker-mysql.sh start

# 2. Configure the API
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — uncomment DATABASE_URL if still commented

# 3. Apply Prisma migrations
npm --prefix apps/api run db:deploy

# 4. Start the API
npm --prefix apps/api run start:dev
```

The API loads `apps/api/.env` automatically on startup (via `src/load-env.ts`). **Restart the API** after editing `.env`.

Verify the database is connected:

```bash
curl -s http://localhost:4000/api/health/ready | jq '.checks.database'
```

Expected when MySQL is up:

```json
{
  "status": "up",
  "latencyMs": <number>
}
```

## Default credentials

These match `scripts/docker-mysql.sh` and `apps/api/.env.example`:

| Setting | Value |
| --- | --- |
| Container name | `bitstockerz-db` |
| Image | `mysql:8` |
| Host port | `3306` |
| Database | `bitstockerz` |
| User | `bitstockerz` |
| Password | `devpassword` |
| Root password | `devpassword` |
| Data volume | `bitstockerz-mysql-data` |

Connection URL:

```text
mysql://bitstockerz:devpassword@localhost:3306/bitstockerz
```

**Do not use these credentials in production.**

## Docker helper script

`scripts/docker-mysql.sh` wraps common operations:

| Command | Action |
| --- | --- |
| `./scripts/docker-mysql.sh start` | Create or start the container; wait until MySQL accepts connections |
| `./scripts/docker-mysql.sh stop` | Stop the container |
| `./scripts/docker-mysql.sh status` | Show container status and port mapping |
| `./scripts/docker-mysql.sh logs` | Tail MySQL logs |
| `./scripts/docker-mysql.sh reset` | Remove container; optionally delete the data volume |

Override defaults with environment variables when starting:

```bash
BITSTOCKERZ_MYSQL_PORT=3307 \
BITSTOCKERZ_MYSQL_PASSWORD=secret \
./scripts/docker-mysql.sh start
```

Update `DATABASE_URL` in `apps/api/.env` to match any overrides.

## Environment variables (`apps/api/.env`)

Copy from `apps/api/.env.example`. Never commit `.env`.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | No | MySQL connection URL. Omit for in-memory mode. |
| `PORT` | No | API port (default `4000`). |
| `NODE_ENV` | No | `development`, `test`, or `production`. |
| `INGESTION_SCHEDULER_ENABLED` | No | Hourly background imports. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` while manually testing ingestion. |
| `JOB_TIMEOUT_MS` | No | Job executor timeout (default `30000`). |
| `JOBS_SYSTEM_USER_ID` | No | User id for scheduled jobs (default matches migration seed). |
| `MARKET_DATA_HEALTH_URL` | No | Optional URL for `/health/ready` `checks.marketData`. |

Prisma CLI commands (`db:deploy`, `db:migrate`) load `apps/api/.env` automatically via `prisma.config.ts`.

## Migrations

| Command | When to use |
| --- | --- |
| `npm --prefix apps/api run db:deploy` | Apply existing migrations (CI, fresh DB, after pull) |
| `npm --prefix apps/api run db:migrate` | Create new migrations during development (interactive) |

Migration folders live in `apps/api/prisma/migrations/`. See [Migrations_Plan.md](./Migrations_Plan.md) for sprint mapping.

## In-memory vs MySQL behavior

| Feature | No `DATABASE_URL` | With MySQL |
| --- | --- | --- |
| Auth / sessions / passkeys | In-memory (tokens, credentials) | Still in-memory today; a minimal `users` row is written when creating jobs (`ensureUserPersisted`). The `webauthn_credentials` table is unused. If you re-register the same email after an API restart, `ensureUserPersisted` deletes any jobs owned by the previous MySQL user id for that email, then replaces that user row with the new in-memory id. |
| Symbol lookup | Seed data in process | DB rows (empty until seeded/imported) |
| Candle reads | In-memory seed bars | DB bars (empty until ingestion) |
| Jobs / ingestion | In-memory job store | `jobs` table; ingestion upserts bar tables |
| `/health/ready` `database` | `{ status: "not_configured" }` | `{ status: "up", latencyMs }` when reachable |

After enabling MySQL on a fresh database, run ingestion (manual testing **Section 8**) before expecting candle endpoints to return data.

## Automated smoke tests

With MySQL running and `DATABASE_URL` in `apps/api/.env`:

```bash
# Full quality gates + HTTP smoke (loads DATABASE_URL from apps/api/.env when KEEP_DATABASE_URL=1)
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify

# Smoke tests only (start API yourself first; reads DATABASE_URL from apps/api/.env for the persistence check)
./scripts/smoke-test-api.sh --sprint all
```

The verify script runs e2e in seed mode (`NODE_ENV=test`, no `DATABASE_URL`) so unit/e2e gates do not require MySQL. Its smoke phase also uses seed mode by default: it sets `DATABASE_URL=` (empty) rather than unsetting it, so `load-env.ts` (`override: false`) does not refill the URL from `apps/api/.env`. Set `KEEP_DATABASE_URL=1` to run smoke with MySQL and optionally verify persisted candles.

## Troubleshooting

**Docker daemon not running**

```bash
open -a Docker
# wait until: docker info
```

**Port 3306 already in use**

Stop the conflicting service or start on another port:

```bash
BITSTOCKERZ_MYSQL_PORT=3307 ./scripts/docker-mysql.sh start
```

**`database.status` is `down`**

- Confirm container is running: `./scripts/docker-mysql.sh status`
- Confirm `DATABASE_URL` in `apps/api/.env` matches credentials and port
- Restart the API after changing `.env`

**Ingestion or `POST /jobs` returns `500 INTERNAL_ERROR`**

- Ensure you are on latest `main` (includes `AuthService.ensureUserPersisted`).
- Restart the API after changing `.env`.
- Re-register to get a fresh bearer token, then retry Section 8 curls.
- If the error mentions `users_email_key`, a stale `users` row from a prior session shares your email but not your current in-memory user id. Latest code replaces stale rows automatically (and deletes jobs owned by the old user id for that email); otherwise reset the dev DB (`./scripts/docker-mysql.sh reset`) or use a new email.

**Migrations fail**

```bash
npm --prefix apps/api run db:deploy
```

If the schema drifted during local experiments, reset the dev database:

```bash
./scripts/docker-mysql.sh reset   # deletes container + optional volume
./scripts/docker-mysql.sh start
npm --prefix apps/api run db:deploy
```

## Related docs

- [manual_testing.md](../manual-testing/manual_testing.md) — curl-based smoke tests
- [API_Inventory.md](./API_Inventory.md) — HTTP API reference
- [Migrations_Plan.md](./Migrations_Plan.md) — sprint → migration mapping
