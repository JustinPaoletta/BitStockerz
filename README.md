# BitStockerz

A private BitStockerz monorepo that combines product and database documentation
with a working NestJS API and Angular application.

## Status

- Type: private product monorepo
- Current repo version: `0.0.0`
- Maturity: pre-1.0 documentation and API foundation
- Current runnable surfaces: `apps/api` and `apps/web`
- Delivery state: Milestones 0–1 and Sprints 2.1–3.4 implemented and locally verified in draft PR #9
- Next ready sprint: 4.1 Accounts & Positions
- Release model: manual changelog + release branch flow documented in [RELEASE.md](./RELEASE.md)

## Quick Links

- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Release process: [RELEASE.md](./RELEASE.md)
- Product roadmap: [docs/product/ROADMAP.md](./docs/product/ROADMAP.md)
- MVP definition: [docs/product/MVP.md](./docs/product/MVP.md)
- UX flows: [docs/product/UX_Flows.md](./docs/product/UX_Flows.md)
- API inventory: [docs/database/API_Inventory.md](./docs/database/API_Inventory.md)
- Database schema (full MVP target): [docs/database/schema.prisma](./docs/database/schema.prisma)
- Runnable API schema: [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma)

## What The Project Covers

- Product definition and implementation planning for the BitStockerz platform.
- Database design, migration planning, lifecycle policy, and API inventory work.
- A NestJS API under `apps/api`, including auth, WebAuthn, market-data
  symbols/candles, jobs/ingestion, observability, and complete owner-scoped
  Strategy Lab CRUD/version history/validation/summaries, plus the pure
  Backtest Engine Core, owner-scoped run/result/trade/equity persistence, and
  authenticated run/list/detail execution APIs with limits and diagnostics.
- An Angular app under `apps/web` with the Sprint 3.4 thin authenticated shell,
  dev login/register flow, backtest list/run/detail screens, Lightweight Charts
  equity curve, paged trades table, responsive layout, and API proxy.

## Tech Stack

- Root tooling: npm, Husky, and commitlint
- API app: NestJS 11, TypeScript, Jest, Pino, and WebAuthn foundations
- Web app: Angular 21.2, TypeScript, Vitest, ESLint, and Lightweight Charts 5.2
- Database: MySQL 8 through Prisma, with a runnable schema/migrations plus
  separate full-MVP target schema and SQL design documents

## Repository Layout

- `apps/api` NestJS API implementation
- `apps/web` Angular SPA implementation
- `docs/product` product roadmap, MVP, UX flows, and stories
- `docs/database` schema, migration, lifecycle, and API design docs
- `docs/manual-testing` curl-based API smoke test guide
- `scripts` Docker MySQL, sprint verification, and HTTP smoke helpers
- root `package.json` repo tooling and release version anchor

## Prerequisites

- Node.js `24.11.1` for `apps/api` and `apps/web`
- npm

## Local Setup

1. Install root dependencies with `npm install`.
2. Install API and web dependencies with `npm --prefix apps/api install` and
   `npm --prefix apps/web install`.
3. **(Recommended)** Start local MySQL and apply migrations — see [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md).
4. Start the API with `npm --prefix apps/api run start:dev` (defaults to `http://localhost:4000/api`).
5. In another terminal, start the Angular app with `npm run web:start`, then
   open `http://localhost:4200`.
6. Use the `docs/` tree as the source of truth for roadmap, product, and data-model context while you work.

## API Documentation

With the API running, the generated contract is available at:

- Interactive Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`
- OpenAPI YAML: `http://localhost:4000/api/openapi.yaml`

Swagger UI supports live requests and persists the bearer token entered through
**Authorize** for the current browser session. Obtain a development token from
`POST /api/auth/register`, or use a passkey/OAuth flow. Test-only hello and
forced-error routes are intentionally excluded from the public contract.

The generated contract is the machine-readable source of truth for shipped
HTTP routes. The [master API inventory](./docs/database/API_Inventory.md)
provides design context and clearly labels future routes; the
[manual testing guide](./docs/manual-testing/manual_testing.md) contains
end-to-end curl workflows.

## Common Commands

- `npm run prepare` installs Husky hooks for the repo.
- `./scripts/docker-mysql.sh start` starts MySQL 8 in Docker for local persistence.
- `npm --prefix apps/api run build` builds the NestJS API.
- `npm --prefix apps/api run lint` runs the API lint checks.
- `npm --prefix apps/api run test` runs the API unit test suite.
- `npm --prefix apps/api run test:cov` runs unit tests with **90%** global coverage gates.
- `npm --prefix apps/api run test:e2e` runs the API end-to-end suite (seed mode; see `apps/api/test/setup-e2e.ts`).
- `npm --prefix apps/api run db:deploy` applies Prisma migrations to MySQL.
- `npm run web:start` starts Angular on port 4200 with `/api` proxied to the API.
- `npm run web:build`, `npm run web:lint`, and `npm run web:test` run the web gates.
- `./scripts/smoke-test-api.sh --sprint all` runs HTTP smoke tests against an already-running API; it honors an exported `DATABASE_URL` but does not load `.env` itself.
- `./scripts/sprint-delivery-verify.sh verify` runs build, lint, test, test:cov, test:e2e, then smoke tests in **seed mode** (clears `DATABASE_URL` for the smoke API even when `apps/api/.env` defines it).
- `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify` runs the same gates, deploys pending migrations, verifies a transactional backtest run/result/trade/equity round trip and post-restart ownership remap, ingests the rolling seed window, smoke tests with MySQL, and restarts the API to verify strategy persistence (loads `DATABASE_URL` from `apps/api/.env`).

## Environment & Configuration

Configuration lives in `apps/api/.env` (copy from `apps/api/.env.example`; never commit `.env`).

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | `development`, `test`, or `production` (default `development`). |
| `DATABASE_URL` | MySQL connection URL. Omit for in-memory seed mode. |
| `INGESTION_SCHEDULER_ENABLED` | Hourly background imports. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` during manual ingestion tests. |
| `JOB_TIMEOUT_MS` | Job executor timeout (default `30000`). |
| `JOBS_SYSTEM_USER_ID` | User id for scheduled jobs (default matches migration seed). |
| `PORT` | API listen port (default `4000`). |
| `READINESS_TIMEOUT_MS` | Per-dependency readiness timeout (default `1500`). |
| `MARKET_DATA_HEALTH_URL` | Optional URL probed by `/health/ready` `checks.marketData` (can point at `/api/market-data/health`). |
| `MARKET_DATA_STALE_EQUITY_DAILY_MS` / `MARKET_DATA_STALE_CRYPTO_DAILY_MS` / `MARKET_DATA_STALE_CRYPTO_HOURLY_MS` | Domain health staleness thresholds (defaults 48h / 36h / 2h). |
| `METRICS_ENABLED` | In-process metrics at `GET /api/metrics` (default `true`). |
| `BACKTEST_TIMEOUT_MS` / `BACKTEST_MAX_BARS` / `BACKTEST_MAX_SERIES_CELLS` | Engine deadline and allocation guards (defaults `5000` / `10000` / `250000`). |
| `BACKTEST_RATE_LIMIT_WINDOW_MS` / `BACKTEST_RATE_LIMIT_MAX_REQUESTS` | Per-user `POST /api/backtests` rate limit (defaults `60000` / `10`). |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS` | Auth ceremony rate limits (defaults `60000` / `30`). |
| `AUTH_SESSION_TTL_SECONDS` / `AUTH_CHALLENGE_TTL_SECONDS` / `AUTH_OAUTH_STATE_TTL_SECONDS` | Session/challenge/state lifetimes (defaults `43200` / `300` / `300`). |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ALLOWED_ORIGINS` | WebAuthn relying-party settings; production requires explicit allowed origins. |
| `GOOGLE_OAUTH_*` / `APPLE_OAUTH_*` | Optional provider credentials and callback URLs; each provider's required set must be complete. |
| `LOG_LEVEL` / `LOG_TO_FILE` / `LOG_FILE_PATH` | Log level and optional file logging (see Observability.md). |

The API loads `apps/api/.env` automatically on startup via `src/load-env.ts`. Restart after editing `.env`.

**MySQL with Docker:** full setup in [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md).

- Start database: `./scripts/docker-mysql.sh start`
- Apply migrations: `npm --prefix apps/api run db:deploy`
- Required pre-merge manual checklist for PR #9: [docs/manual-testing/PRE_MERGE_CHECKLIST.md](./docs/manual-testing/PRE_MERGE_CHECKLIST.md)
- Full curl reference: [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## Testing & Quality Gates

- Run `./scripts/sprint-delivery-verify.sh verify` for API and web build, lint,
  unit, coverage/e2e, audit, and seed HTTP smoke gates.
- Unit tests enforce **90%** global coverage (`branches`, `functions`, `lines`, `statements`).
- E2E tests always run in seed mode (`NODE_ENV=test`, no `DATABASE_URL`) so they do not depend on a local MySQL instance.
- `./scripts/sprint-delivery-verify.sh verify` starts the API for smoke tests in seed mode (clears `DATABASE_URL` for that process). Use `KEEP_DATABASE_URL=1` to run smoke against MySQL using `DATABASE_URL` from `apps/api/.env`.
- Documentation-heavy releases should verify consistency across the roadmap, MVP, API inventory, and schema documents.

## Release Process

- Keep the root `CHANGELOG.md` updated under `## [Unreleased]`.
- Cut release branches as `release/vX.Y.Z` from `main`.
- Use repo-level tags and release notes even when a release only affects `apps/api`; note the scope clearly in the changelog entry.
- Follow the full checklist in [RELEASE.md](./RELEASE.md).

## Additional Docs

- [docs/product/MVP.md](./docs/product/MVP.md)
- [docs/product/ROADMAP.md](./docs/product/ROADMAP.md)
- [docs/product/UX_Flows.md](./docs/product/UX_Flows.md)
- [docs/database/API_Inventory.md](./docs/database/API_Inventory.md)
- [docs/database/schema.prisma](./docs/database/schema.prisma) (full MVP target schema)
- [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma) (runnable persistence subset through Sprint 3.4; Sprints 3.3–3.4 add no tables)
- [docs/plans/README.md](./docs/plans/README.md) (implementation-ready sprint plans and cross-sprint contracts)
- [docs/plans/sprint-2-1-strategy-persistence-versioning.md](./docs/plans/sprint-2-1-strategy-persistence-versioning.md)
- [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md)
- [docs/manual-testing/PRE_MERGE_CHECKLIST.md](./docs/manual-testing/PRE_MERGE_CHECKLIST.md)
- [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## License & Access

UNLICENSED and proprietary.
