# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Milestone 5 Angular app: dark branded shell with logo, passkey-first auth
  (email fallback), `/auth/me` session guard, dashboard widgets with
  independent loading, Strategy Lab create/edit/validate/delete, paper trade
  desk with idempotent market orders, reusable symbol search, and CORS
  allowlist config (`CORS_ALLOWED_ORIGINS`) for the SPA origin.
- Milestone 5 Angular unit coverage (auth, dashboard isolation, strategy
  mapper, display pipes, symbol search, client order ids) and Playwright
  seed-mode workflow e2e covering shell auth, Strategy Lab, backtests, and
  paper trade fill/reject/sell guards.

### Fixed

- Roll back in-memory user creation when passkey registration verification
  fails, so a cancelled/failed ceremony does not block retry with
  “email already registered”.
- Corrected dashboard strategy **Edit** links to open the editor (`/strategies/:id/edit`)
  instead of the detail page.
- Avoid marking auth sessions as checked when `/auth/me` fails after a token-only
  login response; redirect authenticated users away from `/login`.
- Made trade-ticket `client_order_id` rotation unsubscribe on destroy, and raised
  the strategy period minimum to `2` to match the indicator catalog.
- Made auth token storage signal-backed so the shell nav updates after
  login/register instead of staying hidden until a full reload.
- Widened paper-trading average-cost and fill-price columns to
  `DECIMAL(20,8)` so every `DECIMAL(18,6)` market close can be persisted
  without a MySQL out-of-range failure.
- Scoped trades-table CSS so its intentional 850px scroll surface no longer
  resizes and clips Lightweight Charts' internal table at mobile widths.

### Changed

- Synced Milestone 5 delivery docs (roadmap, MVP, UX flows, stories, plans,
  READMEs, manual testing Section 13) and removed the obsolete PR #9
  `PRE_MERGE_CHECKLIST.md` in favor of `manual_testing.md`.
- Removed completed Milestone 2–5 sprint plan files; `docs/plans/` now holds
  only remaining Sprint 6.1–7.2 contracts plus binding cross-sprint rules.

### Added

- Sprint 4 paper trading: one default USD paper account per signup, fixed-scale
  cash/position ledger, long-only fractional market orders, latest-close fills,
  persisted terminal rejections, configurable risk limits, serializable MySQL
  transactions with account locking/retries, seed-mode copy-on-write locking,
  and semantic `client_order_id` idempotency.
- Authenticated paper-account, position, portfolio-summary, order-history, and
  execution-history APIs with stable ordering/pagination, mark-to-market
  unrealized P&L, fail-closed price handling, snake-case decimal contracts,
  generated OpenAPI schemas, and complete trading RFC 7807 codes.
- Sprint 4 unit/integration/e2e coverage, 15-scenario seed/MySQL HTTP smoke,
  and an isolated real-MySQL gate covering provisioning, concurrent
  idempotency, fill/reject accounting, history/valuation, and post-restart
  ownership remap.
- Generated OpenAPI 3.0 JSON/YAML and interactive Swagger UI for every shipped
  product route, including bearer authorization, request constraints, response
  schemas, exact backtest list/detail shapes, ordered trade-pagination
  metadata, RFC 7807 errors, live request support, and contract-coverage tests.
- Sprint 3.4 Angular 21.2 web app with a thin authenticated shell, dev
  login/register flow, backtest list and launch screens, result metrics,
  Lightweight Charts 5.2 equity curve, stable-id paged trades table,
  responsive styling, API proxy, contract fixture, mapper tests, and
  build/lint/unit/browser verification.
- Sprint 3.3 authenticated `POST/GET /api/backtests` run/list/detail APIs,
  synchronous `backtest_run` job handling, immutable strategy replay, batched
  market-data loading, actual and conservative bar limits, cooperative
  cancellation/deadlines, stable terminal errors, diagnostics, metrics,
  structured logs, bounded audit events, POST-only per-user rate limiting, and
  seed/MySQL-compatible owner isolation.
- Sprint 3.2 Prisma models and ordered migrations for backtest runs, one-to-one
  results, trades, equity points, and the deferred nullable jobs foreign key.
- Owner-scoped backtest persistence services with immutable strategy-version
  pinning, pending/running/terminal compare-and-set transitions, transactional
  MySQL completion, copy-on-write seed parity, deterministic reads, 500-row
  inserts, fixed-scale decimal serialization, strategy/symbol asset
  compatibility, latest-vs-explicit timeframe handling, active-symbol and
  owner-job validation, post-restart owner reattachment, and sanitized failure
  records.
- Focused persistence, race, rollback, ownership, malformed-output, precision,
  and version-pinning tests plus a real-MySQL round-trip gate that verifies
  dependent row counts, terminal immutability, and post-restart ownership.
- Completion validates raw engine summaries exactly before rounding, then
  recomputes the stored summary from the fixed-scale trade/equity rows so
  returned details remain internally consistent; run creation rejects initial
  equity with sub-cent precision.
- Sprint 3.1 pure backtest engine core with deterministic SMA/EMA/RSI
  computation, AND-rule evaluation, long-only trade simulation, stop-first
  intrabar SL/TP handling, equity curves, summary metrics, and nullable Sharpe.
- A thin injectable `BacktestEngineService`, fail-fast backtest configuration,
  cooperative monotonic deadlines, caller cancellation, bar/series-cell
  limits, stable `BACKTEST_*` domain codes, and a logical data-only sandbox.
- Hand-computed indicator/rule/risk tests, an 80-bar frozen SMA-cross fixture,
  and a one-year daily performance fixture for the sub-two-second NFR.
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

- The current delivery/docs baseline now covers Milestone 4; Sprint 5.1 Shell
  & Navigation is the next implementation target.
- Stale-user auth remapping now preserves owned backtest runs along with jobs,
  strategies, audit events, and credentials.
- Patched root commit-tooling transitive dependencies `fast-uri` and `js-yaml`;
  root and API production/full-development audits report zero vulnerabilities.
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

- Synchronized the roadmap, stories, API inventory, runnable/full schema,
  migration map, MySQL guide, testing strategy, lifecycle/ERD notes, and a
  copy-paste Sprint 4 manual test workflow through paper-trading completion.
- Reconciled current-state documentation with the code through Sprint 3.4:
  shipped backtest observability/testing, complete configuration and release
  gates, current roadmap/plan status, migration history, database target-model
  fields, local sprint-delivery links/branch map, and final PR #9 browser
  acceptance evidence.

- Make manual verification reproducible with a two-terminal workflow, explicit seed/MySQL startup modes, a change-to-test matrix, executable strategy restart steps, audit-table inspection, and rolling MySQL count expectations.
- Refresh the roadmap through July 26, distinguish locally verified Sprint 2.1 work from merged delivery, keep Sprint 2.2 as `START HERE`, and link every remaining sprint to its ready implementation plan.
- Standardize the repository around a shared README structure, a manual changelog, and a root `RELEASE.md` guide.
- Align docs with code: health/readiness response shape, verify-script seed mode, OAuth redirect URIs in `.env.example`, and scheduler defaults.
- Clarify planned vs shipped API inventory sections; document in-memory auth/passkeys with MySQL; correct testing-strategy and security session claims.
- Tighten scheduler default wording (dev-only when unset), candle `limit` defaults, rate-limit scope, and RFC 7807 `instance` examples.
- Manual testing Sections 5–10 and smoke script use wide candle ranges for rolling seed windows; Section 10 expects typically `ok` health after restart.
