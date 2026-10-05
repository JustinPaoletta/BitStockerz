# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Product extensions (local implementation; deployment pending)

- Add multi-indicator strategy editing, crossover templates and duplication.
- Add pinned allocation, commissions, slippage and next-open simulation settings,
  benchmark curves, comparison, separate-period labels and complete CSV exports.
- Add version-pinned paper runners with durable intent, idempotency, controls and
  attributed activity; add market candles, indicator overlays and watchlists.
- Add fresh-session additional-passkey enrollment, session revocation, personal
  export, archived paper resets and active-account deletion.
- Add parameter-only Kernel change previews under a disabled feature flag.
- Implement Alpaca historical adapters and a bounded licensed-data importer;
  prepare production-health monitoring and MySQL workspace restart regressions.
- Document setup, retention/restore/rollback drills and remaining live checks.
  No production deployment, real vendor success or new MySQL migration success
  is claimed by local tests.

### Documentation accuracy

- Align delivery status with merged PRs #12/#13 and passing main CI; distinguish
  prepared deployment automation from unprovisioned production hosting.
- Refresh Node prerequisites, auth/recovery and API contracts, migration inventory,
  testing/security/observability guides and remaining launch checks.

### Documentation maintenance — October 5, 2026

- Consolidated completed sprint plans and the launch handoff into maintained contracts and deployment procedures.
- Removed completed tasks from the root checklist; retained pending launch and live acceptance conditions.
- Corrected reset/deletion, migration inventory, provider, scheduler, and verification claims.
- Added ASD-STE100 Issue 9 writing guidance and current workflow references.

The milestone entries below preserve delivery history, including superseded framework versions and earlier scope decisions.
Use the current guides for setup, supported behavior, and unfinished work.

### Security and merge readiness

- Refresh compatible dependencies and security overrides across all lockfiles;
  align CI and API containers on Node 24.21.0. Add dependency audit gates.
- Require OAuth nonce, subject and expiry claims; reject unverified Google/Apple
  emails and unsigned Apple callback emails. Require authenticated linking for
  Google third-party email collisions.
- Serialize MySQL AI quota updates so concurrent calls cannot exceed the cap or
  fail with counter-creation conflicts. Keep synthetic ingestion out of production.
- Apply migrations before inspecting their final status.
  Configure the migration job's Node runtime. Pin action revisions. Restrict deployments to `main`.
- Add signed-token and MySQL auth/quota regression checks, and repair database
  smoke-test cleanup for persisted passkeys and paper accounts.

### Prelaunch security review

- Upgrade Angular framework/build tools together to 22.2.1 with TypeScript 6.0.3,
  removing the vulnerable registry-cache dependency. Preserve component behavior
  through the official Eager migration and pin local Node to CI's 24.21.0.
- Restrict browser bearer headers and session-expiry handling to the configured
  API origin and path; reject traversal and credential-bearing URLs.
- Deny manual shared-market ingestion in production and validate concrete bounded
  request DTOs. Require production MySQL persistence and redact public health errors.
- Add binary auth identifier collation, strict persisted identifier matching,
  expiry cleanup, bounded auth limiter storage and explicit ingress proxy trust.
- Add checksum-pinned, redacted CI secret scanning with four exact historical false-positive exceptions.
  Ignore local credentials and browser artifacts. Add Vercel framing, MIME-sniffing, and referrer headers.

### Browser login, profile and recovery

- Added configured Google/Apple browser login, fixed callback redirects and
  one-use verifier-bound handoffs without session tokens in URLs.
- Added explicit recovery-provider linking bound to a fresh original session,
  strict signed identity claims and safe existing-account/email conflict handling.
- Added Profile/Account settings, display-name persistence and shell updates,
  linked-method status and lost-device help without an email-only reset bypass.
- Added atomic MySQL auth persistence/migration, signed JWT regressions, HTTP
  secret redaction, browser tests and recovery/restart ownership checks.
- Documented provider configuration, duplicate-identity migration preflight and
  real-provider production smoke. Extra passkeys were deferred then; October 4 adds local enrollment.

### Prelaunch P&L and trade markers

- Added cumulative realized and total paper P&L to the portfolio API, dashboard,
  and Trade desk, with consistent ledger snapshots and cent-level reconciliation.
- Added entry/exit arrows to backtest equity curves, including daily/hourly UTC
  mapping, paginated marker updates, partial-coverage copy, and chart cleanup.
- Added Sprint 8.1/8.2 plans for Google/Apple browser login and profile/recovery;
  synchronized MVP, roadmap, stories, and API documentation.

### Branding

- Unified all application screens, charts, loading states, validation feedback, code previews, and raster logo/favicons with the Offset brand tokens.

- Introduced the Offset logo system with citron, ink, and chalk colors, monochrome variants, an SVG favicon, lowercase wordmark, and a research-led sign-in experience.

### Dashboard usability review

- Simplified dashboard hierarchy and removed repeated navigation actions; fixed mobile metric overflow and linked symbol selection to a prefilled paper Trade ticket.
- Added keyboard-accessible strategy links, strategy/backtest history pagination, retryable trade pagination, and race-safe backtest strategy resolution.
- Corrected combobox cancellation/ARIA behavior, historical strategy backtest actions, and stale trade feedback; added regression coverage.

### Added

- Auth persistence to MySQL includes users, sessions, passkeys, OAuth identities, WebAuthn challenges, and OAuth state.
  State hydrates on startup when `DATABASE_URL` is set; user identifiers remain stable across API restarts.
- Production auth hardening adds `AUTH_DEV_EMAIL_ENABLED`, `AUTH_LEGACY_WEBAUTHN_ENABLED`, `ERROR_TEST_ENABLED`, and `OPENAPI_ENABLED` configuration flags.
  It adds production startup validation, dev-email rate limits, and the error-test route guard. Angular hides email fallback in production builds.
- Milestone 7 adds an in-process TTL/LRU cache for symbol and candle reads, with ingestion prefix invalidation.
  It adds the provider interface, circuit-breaker guardrails, and `provider` on `GET /api/market-data/health`.
- Milestone 7 deploy artifacts: GitHub Actions `ci.yml` / `deploy.yml`, API
  Dockerfile + Fly.io config, Vercel SPA rewrite, production readiness
  hardening, and `docs/ops/deployment.md` Option A runbook.
- Milestone 6 adds `AiModule` with stub/OpenAI providers, `ai_usage` daily limits, feature flags, and metadata-only audit/logging.
  Advisory endpoints are `POST /api/ai/explain-strategy`, `/validate-strategy`, `/explain-backtest`, and `/suggest-improvements`.
  Diff suggestions were deferred at that milestone; October 4 adds local previews.
- Angular Kernel panels support Explain, Check issues, Explain results, and Suggest improvements on strategy/backtest detail.
  They display disclaimers and separate disabled, quota, and provider errors.
- Milestone 5 adds the branded Angular shell, passkey-first authentication, email fallback, and `/auth/me` session guard.
  Dashboard widgets load independently. Workflows include Strategy Lab CRUD, idempotent paper orders, and reusable symbol search.
  `CORS_ALLOWED_ORIGINS` configures SPA access.
- Milestone 5 adds Angular unit coverage for auth, widget isolation, strategy mapping, display pipes, symbol search, and client-order identifiers.
  Seed-mode Playwright workflows cover shell authentication, Strategy Lab, backtests, and paper fill/reject/sell guards.

### Changed

- Replaced stale MySQL user-id remapping during same-email registration with stable persisted auth identities.
  After an API restart, sign in again instead of registering the same email twice.

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

- Synchronized Milestone 5 roadmap, scope, flows, stories, plans, READMEs, and manual testing Section 13.
  Removed PR #9's obsolete `PRE_MERGE_CHECKLIST.md` in favor of `manual_testing.md`.
- Removed completed Milestone 2–5 plans at that delivery stage. Remaining plans were later consolidated into `docs/plans/README.md`.

### Added

- Sprint 4 adds one USD paper account per signup, a fixed-scale cash/position ledger, and long-only fractional market orders.
  Fills use the latest close; terminal rejections persist. Risk limits and semantic `client_order_id` idempotency are configurable.
  MySQL uses serializable transactions with account locks/retries; seed mode uses copy-on-write locks.
- Authenticated APIs expose paper accounts, positions, portfolio summaries, orders, and executions with stable ordering/pagination.
  They add unrealized P&L, unavailable-price failures, snake-case decimal contracts, generated OpenAPI schemas, and trading RFC 7807 codes.
- Sprint 4 adds unit/integration/e2e coverage, 15-scenario seed/MySQL HTTP smoke, and an isolated MySQL gate.
  The gate covers provisioning, concurrent idempotency, fill/reject accounting, history/valuation, and post-restart ownership remapping.
- Generated OpenAPI 3.0 JSON/YAML and interactive Swagger UI cover shipped product routes.
  Contracts include bearer authorization, request constraints, response schemas, backtest list/detail shapes, trade pagination, and RFC 7807 errors.
  Live requests and route-coverage tests are supported.
- Sprint 3.4 introduced Angular 21.2 with a thin authenticated shell, development login/register, backtest list/launch, and result metrics.
  It added Lightweight Charts 5.2, stable-id paged trades, responsive styles, API proxy, contract fixtures, and mapper tests.
  Build, lint, unit, and browser checks passed.
- Sprint 3.3 adds authenticated `POST/GET /api/backtests`, synchronous `backtest_run` jobs, immutable replay, and batched market reads.
  It adds bar limits, cancellation/deadlines, stable errors, diagnostics, metrics, logs, bounded audits, per-user POST limits, and seed/MySQL ownership isolation.
- Sprint 3.2 Prisma models and ordered migrations for backtest runs, one-to-one
  results, trades, equity points, and the deferred nullable jobs foreign key.
- Owner-scoped backtest persistence pins immutable strategy versions and uses pending/running/terminal compare-and-set transitions.
  Completion is transactional in MySQL and copy-on-write in seed mode. Reads are deterministic; inserts use batches of 500 rows.
  Decimal serialization is fixed-scale. Validation covers asset compatibility, timeframes, active symbols, and owned jobs.
  Restart preserves ownership; failure records are sanitized.
- Focused persistence, race, rollback, ownership, malformed-output, precision,
  and version-pinning tests plus a real-MySQL round-trip gate that verifies
  dependent row counts, terminal immutability, and post-restart ownership.
- Completion validates raw engine summaries exactly before rounding, then recomputes stored metrics from fixed-scale trades/equity.
  Returned details remain internally consistent. Run creation rejects initial equity with sub-cent precision.
- Sprint 3.1 adds deterministic SMA/EMA/RSI computation, AND rules, long-only simulation, and stop-first intrabar SL/TP.
  Output includes equity curves, summary metrics, and nullable Sharpe.
- A thin injectable `BacktestEngineService`, fail-fast backtest configuration,
  cooperative monotonic deadlines, caller cancellation, bar/series-cell
  limits, stable `BACKTEST_*` domain codes, and a logical data-only sandbox.
- Hand-computed indicator/rule/risk tests, an 80-bar frozen SMA-cross fixture,
  and a one-year daily performance fixture for the sub-two-second NFR.
- Sprint 2.3 adds owner-scoped Strategy Lab CRUD with offset-paged active lists, partial metadata updates, immutable versions/history, and soft deletion.
  Update/delete audit events are bounded in seed and MySQL modes.
- Side-effect-free strategy validation by inline definition or owned strategy
  id, deterministic human-readable summaries, and stable
  `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, and
  `STRATEGY_VALIDATION_ERROR` API codes.
- Expanded unit/e2e/seed/MySQL verification and one canonical PR #9 manual
  checklist covering Sprints 2.1–2.3 through restart persistence.
- Sprint 2.2 adds canonical definition types and pure SMA/EMA/RSI validation.
  Definitions use AND-only entry/exit conditions, finite operands, and required percentage risk rules with a 500% take-profit ceiling.
- Public `GET /api/strategies/indicators` catalog plus unit, e2e, seed-smoke, and MySQL-smoke contract coverage.
- One self-contained PR #9 pre-merge manual checklist covering the public catalog, valid/invalid definition writes, owner isolation, round trips, audit metadata, and restart persistence.
- Sprint 2.1 adds MySQL/Prisma strategy persistence, seed parity, authenticated create/get, immutable version 1, and normalized per-user name conflicts.
  Reads are owner-only; creation emits `strategy.created` audit events.
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

- At that delivery baseline, Milestone 4 was complete and Sprint 5.1 Shell & Navigation was next.
- Stale-user auth remapping now preserves owned backtest runs along with jobs,
  strategies, audit events, and credentials.
- Patched root commit-tooling transitive dependencies `fast-uri` and `js-yaml`;
  root and API production/full-development audits report zero vulnerabilities.
- Strategy create/get responses now include deterministic summaries; definition
  validation failures use the strategy-specific validation code.
- Strategy creation now rejects non-canonical definitions before persistence with deterministic definition-rooted RFC 7807 field paths and stable validator codes.
- Updated compatible NestJS and Prisma versions, moved the Prisma CLI to development dependencies, and pinned patched transitive packages.
  At that inspection, production and full-development `npm audit` reported zero vulnerabilities.
- Replaced the unauthenticated strategy placeholder with `StrategiesModule`
  and authenticated RFC 7807 contracts; Sprints 2.2–2.3 subsequently completed
  rule validation and the remaining CRUD surface.
- Strategy DTOs preserve raw text types before validation despite global implicit conversion.
  Seed uniqueness includes MySQL Unicode expansion weights; service length checks count Unicode characters.
- Daily market-data health measures staleness from the end of the represented UTC day, preventing false weekend degradation for Friday equity bars.
- At that revision, `AuthService.ensureUserPersisted` reassigned dependent strategies, jobs, and credentials during stale MySQL user-id remapping.
  Owner reads repaired records after restart and tolerated concurrent audit-triggered remapping. Persisted auth later superseded this path.
- API development default port is `4000` (override with `PORT`).
- Seed OHLCV fixtures in `seed-candles.ts` roll to today in UTC at process load.
  Local health demonstrations can report `ok`; MySQL fixture data still needs ingestion after seed dates change.
- Updated roadmap, README, API inventory, migration plan, story status, and manual-testing docs through Sprint 2.1 completion.
- At that revision, `AuthService.ensureUserPersisted` remapped stale MySQL users, jobs, and credentials during same-email registration.
  It tolerated concurrent unique-constraint races. Persisted auth later superseded this behavior.
- E2E tests force seed mode via `apps/api/test/setup-e2e.ts` so gates pass without a local MySQL instance.
- Exception-path HTTP metrics record in `GlobalHttpExceptionFilter` (interceptor successes only); health aggregates filter active symbols.

### Documentation

- Synchronized roadmap, stories, API inventory, schema references, migration history, MySQL setup, test strategy, and lifecycle/ERD notes through paper-trading completion.
  Added the Sprint 4 manual workflow.
- Reconciled documentation through Sprint 3.4, including observability, testing, configuration, release gates, roadmap status, migrations, and target-model fields.
  Updated local sprint links/branches and recorded PR #9 browser acceptance.

- Made manual verification reproducible with two terminals, explicit seed/MySQL startup, a change-to-test matrix, restart steps, audit inspection, and rolling fixture counts.
- Updated the roadmap through July 26, separating local Sprint 2.1 verification from merged delivery.
  At that time, Sprint 2.2 was `START HERE` and remaining sprints linked to implementation plans.
- Standardize the repository around a shared README structure, a manual changelog, and a root `RELEASE.md` guide.
- Align docs with code: health/readiness response shape, verify-script seed mode, OAuth redirect URIs in `.env.example`, and scheduler defaults.
- Clarify planned vs shipped API inventory sections; document in-memory auth/passkeys with MySQL; correct testing-strategy and security session claims.
- Tighten scheduler default wording (dev-only when unset), candle `limit` defaults, rate-limit scope, and RFC 7807 `instance` examples.
- Manual testing Sections 5–10 and smoke script use wide candle ranges for rolling seed windows; Section 10 expects typically `ok` health after restart.
