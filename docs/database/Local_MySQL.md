# Local MySQL (Docker)

The API uses MySQL 8 through Prisma. Database persistence is optional for local development and tests.
Without `DATABASE_URL`, the API uses in-memory seed data.
Production requires configured MySQL/MariaDB persistence and fails closed without it.

MySQL persists auth/recovery state, jobs, market data, symbols, audit events, strategies, backtests, paper trading, and AI quotas.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) running on your machine
- Node.js `24.21.0` and npm (see root `.nvmrc` and `README.md`)

## Quick start

From the repo root:

```bash
# 1. Start MySQL 8 in Docker (creates container + volume on first run)
./scripts/docker-mysql.sh start

# 2. Configure the API
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
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
  "latencyMs": 12
}
```

## Default credentials

These match `scripts/docker-mysql.sh` and `apps/api/.env.example`:

| Setting        | Value                    |
| -------------- | ------------------------ |
| Container name | `bitstockerz-db`         |
| Image          | `mysql:8`                |
| Host port      | `3306`                   |
| Database       | `bitstockerz`            |
| User           | `bitstockerz`            |
| Password       | `devpassword`            |
| Root password  | `devpassword`            |
| Data volume    | `bitstockerz-mysql-data` |

Connection URL:

```text
mysql://bitstockerz:devpassword@localhost:3306/bitstockerz
```

**Do not use these credentials in production.**

## Docker helper script

`scripts/docker-mysql.sh` wraps common operations:

| Command                            | Action                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `./scripts/docker-mysql.sh start`  | Create or start the container; wait until MySQL accepts connections |
| `./scripts/docker-mysql.sh stop`   | Stop the container                                                  |
| `./scripts/docker-mysql.sh status` | Show container status and port mapping                              |
| `./scripts/docker-mysql.sh logs`   | Tail MySQL logs                                                     |
| `./scripts/docker-mysql.sh reset`  | Remove container; optionally delete the data volume                 |

Override defaults with environment variables when starting:

```bash
BITSTOCKERZ_MYSQL_PORT=3307 \
BITSTOCKERZ_MYSQL_PASSWORD=secret \
./scripts/docker-mysql.sh start
```

Update `DATABASE_URL` in `apps/api/.env` to match any overrides.

## Environment configuration

Copy `apps/api/.env.example` to `apps/api/.env`.
Do not commit `.env`.
Set `DATABASE_URL` to the local database connection URL.
Keep scheduling disabled during manual ingestion tests.
See the [API configuration table](../../apps/api/README.md#configuration) for defaults and production requirements.

Prisma CLI commands load `apps/api/.env` through `prisma.config.ts`.
The server also loads this file on startup; restart after configuration changes.

## Migrations

| Command                                | When to use                                            |
| -------------------------------------- | ------------------------------------------------------ |
| `npm --prefix apps/api run db:deploy`  | Apply existing migrations (CI, fresh DB, after pull)   |
| `npm --prefix apps/api run db:migrate` | Create new migrations during development (interactive) |

Migration folders live in `apps/api/prisma/migrations/`. See [Migrations_Plan.md](./Migrations_Plan.md) for sprint mapping.

## In-memory vs MySQL behavior

| Feature                                     | No `DATABASE_URL`                               | With MySQL                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth / sessions / passkeys / OAuth handoffs | Process-local auth and one-use ceremony state   | Persisted in MySQL (`users`, `auth_sessions`, `webauthn_credentials`, `oauth_identities`, `webauthn_challenges`, `oauth_states`, `oauth_handoffs`); users and sessions hydrate on startup and one-use ceremonies redeem through persistence. User ids stay stable across restarts; use passkey/OAuth or dev email login instead of registering the same email again. Successful signup provisions the paper account. |
| Symbol lookup                               | Seed data in process                            | DB rows (empty until seeded/imported)                                                                                                                                                                                                                                                                                                                                                                                |
| Candle reads                                | In-memory seed bars                             | DB bars (empty until ingestion)                                                                                                                                                                                                                                                                                                                                                                                      |
| Jobs / ingestion                            | In-memory job store                             | `jobs` table; ingestion upserts bar tables                                                                                                                                                                                                                                                                                                                                                                           |
| Strategies                                  | In-memory owner-scoped store                    | `strategies` + immutable `strategy_versions`; metadata/version 1 survive API restarts                                                                                                                                                                                                                                                                                                                                |
| Backtests                                   | In-memory owner-scoped copy-on-write aggregates | `backtest_runs`, one-to-one results, trades, and equity points; terminal completion is transactional and immutable                                                                                                                                                                                                                                                                                                   |
| Paper trading                               | Per-account mutex/copy-on-write maps            | `paper_accounts`, `orders`, `executions`, and `positions`; serializable fills lock the account and commit terminal state atomically                                                                                                                                                                                                                                                                                  |
| AI daily quota                              | Per-user/day process-local map                  | `ai_usage` with serialized concurrent quota updates                                                                                                                                                                                                                                                                                                                                                                  |
| `/health/ready` `database`                  | `{ status: "not_configured" }`                  | `{ status: "up", latencyMs }` when reachable                                                                                                                                                                                                                                                                                                                                                                         |

After enabling MySQL on a fresh database, run ingestion (manual testing **Section 8**) before expecting candle endpoints to return data.

## Automated smoke tests

With MySQL running and `DATABASE_URL` in `apps/api/.env`:

```bash
# Full quality gates + HTTP smoke (loads DATABASE_URL from apps/api/.env when KEEP_DATABASE_URL=1)
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify

# Smoke tests only (start API yourself first, then safely export DATABASE_URL)
source scripts/lib/load-api-env.sh
load_database_url_from_api_env "$PWD/apps/api"
./scripts/smoke-test-api.sh --sprint all
```

The verification script runs HTTP e2e in seed mode without MySQL.
Its smoke API also defaults to seed mode.
It exports an empty `DATABASE_URL`, preventing `load-env.ts` from loading a URL from `.env`.

With `KEEP_DATABASE_URL=1`, the script applies migrations and runs backtest, trading, and recovery MySQL gates.
It ingests the rolling fixture window, tests persisted reads, and restarts the API to test strategy ownership.
The trading gate includes provisioning, concurrent idempotency, rejection, cash/position/history/valuation, and auth hydration.
Its fixtures are isolated and removed afterward.

The script omits MySQL security/workspace gates, native OAuth/CLI tests, and Playwright.
Run those separately through the [testing strategy](../product/requirements/Testing_Strategy.md).
The standalone smoke script uses only an exported `DATABASE_URL`; it does not load `.env`.
Match that environment to the running API's data mode.

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

- Restart the API after changing `.env`.
- Log in (or register a new email) to get a fresh bearer token, then retry
  Section 8 curls.
- If the error mentions `users_email_key`, a stale `users` row from an earlier
  experiment may conflict with a new signup. Sign in to the existing account or use a new test email.
  Reset only a disposable database whose contents you can delete.

**Migrations fail**

```bash
npm --prefix apps/api run db:deploy
```

If local experiments caused schema drift, inspect the migration history first.
Reset only a disposable development database; this removes its data.

```bash
./scripts/docker-mysql.sh reset   # deletes container + optional volume
./scripts/docker-mysql.sh start
npm --prefix apps/api run db:deploy
```

## Related docs

- [manual_testing.md](../manual-testing/manual_testing.md) — curl-based smoke tests
- [API_Inventory.md](./API_Inventory.md) — HTTP API reference
- [Migrations_Plan.md](./Migrations_Plan.md) — sprint → migration mapping
