# BitStockerz API

NestJS API for BitStockerz (`apps/api`). Global prefix: `/api`. Default port: **4000**.

## Quick start

```bash
npm install
cp .env.example .env   # optional — omit DATABASE_URL for in-memory seed mode
npm run start:dev
```

MySQL setup: [docs/database/Local_MySQL.md](../../docs/database/Local_MySQL.md)

## Commands

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests |
| `npm run test:cov` | Unit tests + **90%** global coverage gates |
| `npm run test:e2e` | E2E suite (forces seed mode via `test/setup-e2e.ts`) |
| `npm run db:deploy` | Apply Prisma migrations |

## Configuration

Copy `.env.example` to `.env` (never commit `.env`). The server loads `.env` on startup via `src/load-env.ts`.

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` (default `development`). |
| `DATABASE_URL` | MySQL URL. Omit for in-memory seed mode. |
| `PORT` | Listen port (default `4000`). |
| `READINESS_TIMEOUT_MS` | Per-dependency readiness timeout (default `1500`, range `100`–`30000`). |
| `LOG_LEVEL` | Pino level (default `info`). |
| `LOG_TO_FILE` / `LOG_FILE_PATH` | Optional file logging; a path alone also enables it. |
| `INGESTION_SCHEDULER_ENABLED` | Hourly background imports. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` while manually testing ingestion. |
| `JOB_TIMEOUT_MS` | Job executor timeout (default `30000`). |
| `JOBS_SYSTEM_USER_ID` | User id for scheduled jobs (default `00000000-0000-4000-8000-000000000001`). |
| `MARKET_DATA_HEALTH_URL` | Optional readiness probe for `checks.marketData` (can point at `/api/market-data/health`). |
| `MARKET_DATA_STALE_*_MS` | Staleness thresholds for `GET /api/market-data/health` (equity daily / crypto daily / crypto hourly). |
| `METRICS_ENABLED` | Toggle in-process `GET /api/metrics` (default `true`). |
| `AUTH_SESSION_TTL_SECONDS` | Bearer-session lifetime (default `43200`, maximum `604800`). |
| `AUTH_CHALLENGE_TTL_SECONDS` / `AUTH_OAUTH_STATE_TTL_SECONDS` | WebAuthn challenge and OAuth state lifetimes (defaults `300`). |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS` | WebAuthn/OAuth ceremony and dev email register/login rate limit (defaults `60000` / `30`). |
| `AUTH_DEV_EMAIL_ENABLED` | Dev email register/login shortcuts (default `true` outside production; must be `false` in production). |
| `AUTH_LEGACY_WEBAUTHN_ENABLED` | Legacy WebAuthn bypass for local automation (default `true` outside production; must be `false` in production). |
| `ERROR_TEST_ENABLED` | Forced-error test routes (default `true` only when `NODE_ENV=test`; must be `false` in production). |
| `OPENAPI_ENABLED` | Swagger UI and OpenAPI JSON/YAML (default `true` outside production; default `false` in production). |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ALLOWED_ORIGINS` | WebAuthn relying-party settings. Production WebAuthn requires explicit allowed origins. |
| `GOOGLE_OAUTH_*` / `APPLE_OAUTH_*` | Optional provider configuration; all required values for an enabled provider must be set together. |
| `BACKTEST_TIMEOUT_MS` / `BACKTEST_MAX_BARS` / `BACKTEST_MAX_SERIES_CELLS` | Engine execution and allocation limits (defaults `5000` / `10000` / `250000`). |
| `BACKTEST_RATE_LIMIT_WINDOW_MS` / `BACKTEST_RATE_LIMIT_MAX_REQUESTS` | Per-user backtest-create rate limit (defaults `60000` / `10`). |

## Verification

From repo root:

```bash
./scripts/sprint-delivery-verify.sh verify
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify   # smoke + MySQL persistence (loads apps/api/.env)
```

Manual curl tests: [docs/manual-testing/manual_testing.md](../../docs/manual-testing/manual_testing.md)

## Docs

When `OPENAPI_ENABLED=true` (default outside production):

- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON/YAML: `http://localhost:4000/api/openapi.json` and
  `http://localhost:4000/api/openapi.yaml`
- [API inventory](../../docs/database/API_Inventory.md)
- [Roadmap](../../docs/product/ROADMAP.md)
- [Root README](../../README.md)
