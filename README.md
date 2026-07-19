# BitStockerz

A private BitStockerz monorepo that combines product and database documentation with an early NestJS API implementation.

## Status

- Type: private product monorepo
- Current repo version: `0.0.0`
- Maturity: pre-1.0 documentation and API foundation
- Current runnable surface: `apps/api`
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
- A NestJS API foundation under `apps/api`, including auth, WebAuthn, market-data symbols, candle read APIs, jobs, and ingestion.

## Tech Stack

- Root tooling: npm, Husky, and commitlint
- API app: NestJS 11, TypeScript, Jest, Pino, and WebAuthn foundations
- Database planning: Prisma schema plus SQL documentation and migration notes

## Repository Layout

- `apps/api` NestJS API implementation
- `docs/product` product roadmap, MVP, UX flows, and stories
- `docs/database` schema, migration, lifecycle, and API design docs
- `docs/manual-testing` curl-based API smoke test guide
- `scripts` Docker MySQL, sprint verification, and HTTP smoke helpers
- root `package.json` repo tooling and release version anchor

## Prerequisites

- Node.js `24.11.1` for `apps/api`
- npm

## Local Setup

1. Install root dependencies with `npm install`.
2. Install API dependencies with `npm --prefix apps/api install`.
3. **(Recommended)** Start local MySQL and apply migrations — see [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md).
4. Start the API with `npm --prefix apps/api run start:dev` (defaults to `http://localhost:4000/api`).
5. Use the `docs/` tree as the source of truth for roadmap, product, and data-model context while you work.

## Common Commands

- `npm run prepare` installs Husky hooks for the repo.
- `./scripts/docker-mysql.sh start` starts MySQL 8 in Docker for local persistence.
- `npm --prefix apps/api run build` builds the NestJS API.
- `npm --prefix apps/api run lint` runs the API lint checks.
- `npm --prefix apps/api run test` runs the API unit test suite.
- `npm --prefix apps/api run test:cov` runs unit tests with **90%** global coverage gates.
- `npm --prefix apps/api run test:e2e` runs the API end-to-end suite (seed mode; see `apps/api/test/setup-e2e.ts`).
- `npm --prefix apps/api run db:deploy` applies Prisma migrations to MySQL.
- `./scripts/smoke-test-api.sh --sprint all` runs HTTP smoke tests (API must be running; reads `DATABASE_URL` from `apps/api/.env` when set).
- `./scripts/sprint-delivery-verify.sh verify` runs build, lint, test, test:cov, test:e2e, then smoke tests in **seed mode** (clears `DATABASE_URL` for the smoke API even when `apps/api/.env` defines it).
- `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify` runs the same gates, then smoke tests with MySQL (loads `DATABASE_URL` from `apps/api/.env`).

## Environment & Configuration

Configuration lives in `apps/api/.env` (copy from `apps/api/.env.example`; never commit `.env`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL. Omit for in-memory seed mode. |
| `INGESTION_SCHEDULER_ENABLED` | Hourly background imports. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` during manual ingestion tests. |
| `JOB_TIMEOUT_MS` | Job executor timeout (default `30000`). |
| `JOBS_SYSTEM_USER_ID` | User id for scheduled jobs (default matches migration seed). |
| `PORT` | API listen port (default `4000`). |
| `MARKET_DATA_HEALTH_URL` | Optional URL probed by `/health/ready` `checks.marketData`. |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS` | Auth ceremony rate limits (defaults `60000` / `30`). |
| `LOG_TO_FILE` / `LOG_FILE_PATH` | Optional file logging (see Observability.md). |

The API loads `apps/api/.env` automatically on startup via `src/load-env.ts`. Restart after editing `.env`.

**MySQL with Docker:** full setup in [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md).

- Start database: `./scripts/docker-mysql.sh start`
- Apply migrations: `npm --prefix apps/api run db:deploy`
- Manual curl tests: [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## Testing & Quality Gates

- API-focused releases should run `build`, `lint`, `test`, `test:cov`, and `test:e2e` from `apps/api`, or `./scripts/sprint-delivery-verify.sh verify` from the repo root.
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
- [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma) (runnable subset through Sprint 1.3)
- [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md)
- [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## License & Access

UNLICENSED and proprietary.
