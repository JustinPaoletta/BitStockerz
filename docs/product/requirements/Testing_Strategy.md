# BitStockerz – Testing Strategy

This document defines how correctness is validated for the BitStockerz MVP.

## 1. Testing Levels

### 1.1 Unit Tests
Focus: deterministic logic, no I/O.

Currently covered areas:
- Indicator calculations (SMA, EMA, RSI, etc.)
- Strategy rule evaluation (entry/exit conditions)
- Backtest P&L math (trade P&L, equity curve updates)
- Strategy CRUD/versioning, persistence, validation, and summaries
- Backtest persistence, lifecycle transitions, limits, paging, and HTTP orchestration
- Generated OpenAPI route/schema/security contracts
- Position math (average cost, quantity updates)
- Cash/order/execution accounting
- Trading risk, price freshness/fallback, idempotency races, portfolio MTM,
  stable paging, and in-memory transaction rollback

Rules:
- No database access
- No external APIs
- Fixed input → fixed output

### 1.2 Integration Tests
Focus: API + database working together.

**Current state:** Covered HTTP integration runs in seed mode, while isolated
real-MySQL scripts verify backtest persistence and paper-trading transaction,
race, valuation, and restart-remap behavior. The full MySQL path is included in
`KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`.

**Target coverage (as domains ship):**
- Strategy CRUD
- Backtest creation & persistence
- Order placement → execution → position update
- Auth-scoped access (user isolation)

Rules (when added):
- Real database (test instance)
- Migrations applied before tests
- Deterministic fixtures for OHLCV data

### 1.3 End-to-End (E2E)
Focus: user-visible flows and completed API surface.

**Shipped scope (Sprints 0.1–4.3):**

Happy paths:
- Health live/ready probes
- Register/login, profile, passkey and OAuth ceremony endpoints
- Symbol lookup and search (public)
- Equity and crypto candle reads (public)
- Job creation, ingestion endpoints, and job status fetch (authenticated)
- Owner-scoped strategy CRUD/version history/validation and public indicator catalog
- Backtest create/list/detail, resource/rate limits, stable trade paging, and owner isolation
- Paper-account bootstrap, market fill/reject/replay, cash/position lifecycle,
  portfolio MTM, order/execution paging, strict validation, and owner isolation

Failure paths:
- RFC 7807 validation, not-found, unauthorized, and rate-limit responses
- Unknown symbol lookup returns `NOT_FOUND`
- Reversed date ranges and invalid query params return `VALIDATION_ERROR`

**Rules:**
- E2E runs in seed mode: `NODE_ENV=test` and no `DATABASE_URL` (see `apps/api/test/setup-e2e.ts`).
- Do not require a local MySQL instance for CI or `./scripts/sprint-delivery-verify.sh verify`.

**Web component/browser coverage:**
- `apps/web` uses Vitest for auth, mapping, and backtest-detail component behavior.
- PR #9's canonical manual checklist covers login → list → run → detail,
  one-trade/no-trade states, 501-row paging, 390px responsive layout, clean
  console/network behavior, Swagger UI, and protected-route logout behavior.

**Future scope (not yet implemented):**
- Dashboard aggregation and complete Strategy Lab/paper-trading UI workflows
- AI assistant flows

## 2. Test Data
- Small OHLCV fixtures (10–100 candles)
- Predefined strategy JSON fixtures
- Deterministic timestamps

## 3. CI Enforcement
- Unit and e2e (seed-mode) tests required before merge for API changes
- MySQL-backed smoke / persistence checks are recommended when touching Prisma or ingestion, via `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`
- E2E required before merging backend PRs that touch completed API scope
  (health, auth, symbols, candles, jobs, ingestion, market-data health, metrics,
  strategies, backtests, or paper trading).
- Web lint, unit, and production build gates are required for Angular changes.
- `test:cov` enforces **90%** global coverage in `apps/api`
- `./scripts/sprint-delivery-verify.sh verify` runs build, lint, test, test:cov, test:e2e, and HTTP smoke tests (smoke phase clears `DATABASE_URL` by default).
- MySQL persistence gates are required when changing persisted strategy,
  backtest, or paper-trading behavior.
