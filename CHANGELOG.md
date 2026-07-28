# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Sprint 2.3 complete owner-scoped Strategy Lab CRUD: offset-paged active list,
  partial metadata updates, immutable definition versions/history, soft delete,
  and bounded update/delete audit events in seed and MySQL modes.
- Side-effect-free strategy validation by inline definition or owned strategy
  id, deterministic human-readable summaries, and stable
  `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, and
  `STRATEGY_VALIDATION_ERROR` API codes.
- Expanded unit/e2e/seed/MySQL verification and one canonical PR #9 manual
  checklist covering Sprints 2.1–2.3 through restart persistence.
- Sprint 2.2 canonical strategy-definition types and pure validation for SMA/EMA/RSI indicators, AND-only entry/exit conditions, finite operands, and required percent risk rules with a 500% take-profit ceiling.
- Public `GET /api/strategies/indicators` catalog plus unit, e2e, seed-smoke, and MySQL-smoke contract coverage.
- One self-contained PR #9 pre-merge manual checklist covering the public catalog, valid/invalid definition writes, owner isolation, round trips, audit metadata, and restart persistence.
- Sprint 2.1 strategy persistence and versioning: MySQL/Prisma schema, seed-mode parity, authenticated create/get endpoints, immutable version 1 definitions, normalized per-user name conflicts, owner-only reads, and `strategy.created` audit events.
- Sprint 2.1 unit, e2e, manual, seed-smoke, and MySQL-smoke coverage.
- Sprint 1.4 data health and observability: candle sanity checks, `GET /api/market-data/health`, in-process `GET /api/metrics`, and `audit_events` audit trail.
- Local MySQL 8 Docker workflow (`scripts/docker-mysql.sh`, `docs/database/Local_MySQL.md`, `apps/api/.env.example`).
- `npm --prefix apps/api run db:deploy` for non-interactive migration apply; Prisma loads `apps/api/.env` automatically.
- Sprint 1.3 jobs infrastructure (`jobs` table, synchronous executor, timeout handling) and market-data ingestion endpoints with hourly scheduler.
- Sprint 1.2 equity daily and crypto daily/hourly candle read APIs with deterministic in-memory seed fallback.
- Sprint 1.1 symbol lookup and search APIs with in-memory seed data and optional MySQL backing via Prisma.
- Manual testing guide for health, auth, symbol, candle, job, and ingestion endpoints (`docs/manual-testing/manual_testing.md`).
- Sprint delivery verification scripts (`scripts/sprint-delivery-verify.sh`, `scripts/smoke-test-api.sh`, `scripts/lib/load-api-env.sh`).
- API `.env` auto-load on startup (`apps/api/src/load-env.ts`).

### Changed

- Strategy create/get responses now include deterministic summaries; definition
  validation failures use the strategy-specific validation code.
- Strategy creation now rejects non-canonical definitions before persistence with deterministic definition-rooted RFC 7807 field paths and stable validator codes.
- Refreshed NestJS and Prisma to their current compatible releases, moved the Prisma CLI to development dependencies, and pinned patched transitive packages; both production and full development `npm audit` now report zero vulnerabilities.
- Replaced the unauthenticated strategy placeholder with `StrategiesModule`
  and authenticated RFC 7807 contracts; Sprints 2.2–2.3 subsequently completed
  rule validation and the remaining CRUD surface.
- Strategy DTOs preserve raw text-field types before validation despite global implicit conversion; seed uniqueness includes MySQL Unicode expansion weights and service length checks count Unicode characters.
- Daily market-data health measures staleness from the end of the represented UTC day, preventing false weekend degradation for Friday equity bars.
- `AuthService.ensureUserPersisted` now reassigns dependent strategies as well as jobs/credentials when remapping a stale MySQL user id; owner reads perform the repair immediately after an API restart and tolerate a concurrent audit-triggered remap.
- API development default port is `4000` (override with `PORT`).
- Seed OHLCV fixtures in `seed-candles.ts` roll to today (UTC) at process load so local market-data health demos can report `ok` (MySQL still needs re-ingestion after restart).
- Updated roadmap, README, API inventory, migration plan, story status, and manual-testing docs through Sprint 2.1 completion.
- `AuthService.ensureUserPersisted` remaps stale MySQL user rows (and dependent jobs/credentials) when the same email is re-registered under a new in-memory id, and tolerates concurrent unique-constraint races on first persist.
- E2E tests force seed mode via `apps/api/test/setup-e2e.ts` so gates pass without a local MySQL instance.
- Exception-path HTTP metrics record in `GlobalHttpExceptionFilter` (interceptor successes only); health aggregates filter active symbols.

### Documentation

- Make manual verification reproducible with a two-terminal workflow, explicit seed/MySQL startup modes, a change-to-test matrix, executable strategy restart steps, audit-table inspection, and rolling MySQL count expectations.
- Refresh the roadmap through July 26, distinguish locally verified Sprint 2.1 work from merged delivery, keep Sprint 2.2 as `START HERE`, and link every remaining sprint to its ready implementation plan.
- Standardize the repository around a shared README structure, a manual changelog, and a root `RELEASE.md` guide.
- Align docs with code: health/readiness response shape, verify-script seed mode, OAuth redirect URIs in `.env.example`, and scheduler defaults.
- Clarify planned vs shipped API inventory sections; document in-memory auth/passkeys with MySQL; correct testing-strategy and security session claims.
- Tighten scheduler default wording (dev-only when unset), candle `limit` defaults, rate-limit scope, and RFC 7807 `instance` examples.
- Manual testing Sections 5–10 and smoke script use wide candle ranges for rolling seed windows; Section 10 expects typically `ok` health after restart.
