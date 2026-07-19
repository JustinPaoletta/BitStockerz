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
- Database schema: [docs/database/schema.prisma](./docs/database/schema.prisma)

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
- `npm --prefix apps/api run test:e2e` runs the API end-to-end suite.
- `npm --prefix apps/api run db:deploy` applies Prisma migrations to MySQL.
- `./scripts/smoke-test-api.sh --sprint all` runs HTTP smoke tests (API must be running).
- `./scripts/sprint-delivery-verify.sh verify` runs build/lint/test/cov/e2e plus smoke tests.

## Environment & Configuration

Configuration lives in `apps/api/.env` (copy from `apps/api/.env.example`; never commit `.env`).

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL connection URL. Omit for in-memory seed mode. |
| `INGESTION_SCHEDULER_ENABLED` | Set `false` during manual ingestion tests to disable hourly cron. |
| `JOB_TIMEOUT_MS` | Job executor timeout (default `30000`). |
| `PORT` | API listen port (default `4000`). |

**MySQL with Docker:** full setup in [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md).

- Start database: `./scripts/docker-mysql.sh start`
- Apply migrations: `npm --prefix apps/api run db:deploy`
- Manual curl tests: [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## Testing & Quality Gates

- API-focused releases should run `build`, `lint`, `test`, and `test:e2e` from `apps/api`.
- The e2e suite covers health checks, auth flows, symbols, candles, jobs, and ingestion for completed backend scope.
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
- [docs/database/schema.prisma](./docs/database/schema.prisma)
- [docs/database/Local_MySQL.md](./docs/database/Local_MySQL.md)
- [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## License & Access

UNLICENSED and proprietary.
