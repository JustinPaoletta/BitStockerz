# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Local MySQL 8 Docker workflow (`scripts/docker-mysql.sh`, `docs/database/Local_MySQL.md`, `apps/api/.env.example`).
- `npm --prefix apps/api run db:deploy` for non-interactive migration apply; Prisma loads `apps/api/.env` automatically.
- Sprint 1.3 jobs infrastructure (`jobs` table, synchronous executor, timeout handling) and market-data ingestion endpoints with hourly scheduler.
- Sprint 1.2 equity daily and crypto daily/hourly candle read APIs with deterministic in-memory seed fallback.
- Sprint 1.1 symbol lookup and search APIs with in-memory seed data and optional MySQL backing via Prisma.
- Manual testing guide for health, auth, symbol, candle, job, and ingestion endpoints (`docs/manual-testing/manual_testing.md`).
- Sprint delivery verification scripts (`scripts/sprint-delivery-verify.sh`, `scripts/smoke-test-api.sh`, `scripts/lib/load-api-env.sh`).
- API `.env` auto-load on startup (`apps/api/src/load-env.ts`).

### Changed

- API development default port is `4000` (override with `PORT`).
- Updated roadmap, README, API inventory, migration plan, and story status docs to reflect Sprint 1.3 completion.
- `AuthService.ensureUserPersisted` remaps stale MySQL user rows (and dependent jobs/credentials) when the same email is re-registered under a new in-memory id, and tolerates concurrent unique-constraint races on first persist.
- E2E tests force seed mode via `apps/api/test/setup-e2e.ts` so gates pass without a local MySQL instance.

### Documentation

- Standardize the repository around a shared README structure, a manual changelog, and a root `RELEASE.md` guide.
- Align docs with code: health/readiness response shape, verify-script seed mode, OAuth redirect URIs in `.env.example`, and scheduler defaults.
- Clarify planned vs shipped API inventory sections; document in-memory auth/passkeys with MySQL; correct testing-strategy and security session claims.
- Tighten scheduler default wording (dev-only when unset), candle `limit` defaults, rate-limit scope, and RFC 7807 `instance` examples.
