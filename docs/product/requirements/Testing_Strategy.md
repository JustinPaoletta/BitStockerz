# BitStockerz – Testing Strategy

This document defines how correctness is validated for the BitStockerz MVP.

## 1. Testing Levels

### 1.1 Unit Tests
Focus: deterministic logic, no I/O.

Covered areas:
- Indicator calculations (SMA, EMA, RSI, etc.)
- Strategy rule evaluation (entry/exit conditions)
- Backtest P&L math (trade P&L, equity curve updates)
- Position math (avg cost, quantity updates)

Rules:
- No database access
- No external APIs
- Fixed input → fixed output

### 1.2 Integration Tests
Focus: API + database working together.

**Current state:** There is no separate NestJS “integration” suite against MySQL yet. Persistence is exercised manually and via `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify` / smoke tests when a local DB is available.

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

**Shipped scope (Sprints 0.1–1.3):**

Happy paths:
- Health live/ready probes
- Register/login, profile, passkey and OAuth ceremony endpoints
- Symbol lookup and search (public)
- Equity and crypto candle reads (public)
- Job creation, ingestion endpoints, and job status fetch (authenticated)

Failure paths:
- RFC 7807 validation, not-found, unauthorized, and rate-limit responses
- Unknown symbol lookup returns `NOT_FOUND`
- Reversed date ranges and invalid query params return `VALIDATION_ERROR`

**Rules:**
- E2E runs in seed mode: `NODE_ENV=test` and no `DATABASE_URL` (see `apps/api/test/setup-e2e.ts`).
- Do not require a local MySQL instance for CI or `./scripts/sprint-delivery-verify.sh verify`.

**Future scope (not yet implemented):**
- Register → create strategy → run backtest → view results
- Place paper trade → view position & P&L

## 2. Test Data
- Small OHLCV fixtures (10–100 candles)
- Predefined strategy JSON fixtures
- Deterministic timestamps

## 3. CI Enforcement
- Unit and e2e (seed-mode) tests required before merge for API changes
- MySQL-backed smoke / persistence checks are recommended when touching Prisma or ingestion, via `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`
- E2E required before merging backend PRs that touch completed API scope (health, auth, symbols, candles, jobs, ingestion)
- `test:cov` enforces **90%** global coverage in `apps/api`
- `./scripts/sprint-delivery-verify.sh verify` runs build, lint, test, test:cov, test:e2e, and HTTP smoke tests (smoke phase clears `DATABASE_URL` by default).
- Broader E2E user flows (strategies, backtests, paper trading) remain optional for MVP, mandatory before public release
