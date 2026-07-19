# BitStockerz – Master API Inventory

This document is a **master API inventory** derived from the MVP stories **#1–#8**.
It describes:

- Internal HTTP APIs (what your Angular app and services call)
- Internal service boundaries (where NestJS modules should exist)
- External data providers (for market data, at a high level)

It’s organized by domain, not by story number.

### Backend implementation status

The runnable API in `apps/api` currently ships through **Sprint 1.3**:

| Area | Status | Notes |
| --- | --- | --- |
| Health & readiness | Shipped (0.1) | `/health/live`, `/health/ready` |
| Auth, sessions, profile | Shipped (0.2) | Passkeys, Google/Apple OAuth, bearer sessions |
| Symbol lookup & search | Shipped (1.1) | Public endpoints; in-memory seed data without `DATABASE_URL` |
| Market-data schemas | Shipped (1.1) | Prisma migrations create `symbols` and OHLCV bar tables |
| Candle read APIs | Shipped (1.2) | Public equity daily and crypto daily/hourly endpoints; deterministic in-memory seed fallback without `DATABASE_URL` |
| Jobs & ingestion | Shipped (1.3) | `jobs` table, synchronous executor, ingestion endpoints, hourly scheduler |
| Trading, strategies | Planned | Described below; not implemented yet. A dev-only stub at `POST /api/strategies` returns placeholder JSON and is not part of shipped scope. |

Without `DATABASE_URL`, auth (users, sessions, passkeys), symbol data, candle fixtures, and jobs are in-memory. With MySQL, set `DATABASE_URL` in `apps/api/.env`, run `npm run db:deploy` in `apps/api`, and see [Local_MySQL.md](./Local_MySQL.md). Auth remains in-memory even with MySQL (the `webauthn_credentials` table exists but is unused today); creating a job upserts a minimal `users` row for foreign keys via `ensureUserPersisted`. If the same email is re-registered under a new in-memory user id, that helper deletes jobs owned by the previous MySQL user for that email, then replaces the stale user row. Ingestion upserts seed OHLCV bars into bar tables when the database is enabled.

Sections marked **(Planned)** below are design targets from the MVP stories — they are not implemented in `apps/api` yet.

---

## 0. Conventions

- All endpoints are prefixed with `/api` at the gateway level (e.g. `/api/auth/login`).
- All responses on error follow RFC 7807 (Problem Details) with extensions:

```json
{
  "type": "https://bitstockerz.dev/errors/validation",
  "title": "Validation error",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/strategies",
  "code": "VALIDATION_ERROR",
  "requestId": "uuid-or-correlation-id",
  "fieldErrors": [
    { "field": "email", "reason": "invalid_format" }
  ]
}
```

- `type`, `title`, `status`, `detail`, `instance` follow RFC 7807.
- Extensions: `code` (stable), `requestId`, and optional `fieldErrors`.
- All endpoints require authentication unless explicitly stated (e.g. health checks, symbol lookup/search, candle reads). The dev-only `POST /strategies` stub is also unauthenticated and is not part of shipped scope.

### 0.1 Error code catalog

Clients should branch on `code` for stable behavior; `title` and `detail` are human-facing.

| code | HTTP status | type suffix | title |
| --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | validation | Validation error |
| UNAUTHORIZED | 401 | unauthorized | Unauthorized |
| FORBIDDEN | 403 | forbidden | Forbidden |
| NOT_FOUND | 404 | not-found | Not found |
| CONFLICT | 409 | conflict | Conflict |
| RATE_LIMITED | 429 | rate-limited | Rate limited |
| INTERNAL_ERROR | 500 | internal | Internal server error |

- `type` is always `https://bitstockerz.dev/errors/{type suffix}`.
- `instance` is the request path (no host), e.g. `/api/strategies`.
- `requestId` is set from the `x-request-id` header when provided; otherwise the server generates a correlation ID. Use it for support and logs.
- `fieldErrors` is only present for `VALIDATION_ERROR` and contains `{ field, reason }` entries.

### 0.2 Client examples

**Handling validation errors (400):**

```json
{
  "type": "https://bitstockerz.dev/errors/validation",
  "title": "Validation error",
  "status": 400,
  "detail": "One or more fields are invalid.",
  "instance": "/api/strategies",
  "code": "VALIDATION_ERROR",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fieldErrors": [
    { "field": "name", "reason": "name must be a string" },
    { "field": "asset_type", "reason": "asset_type must be one of EQUITY, CRYPTO" }
  ]
}
```

**Handling not found (404):**

```json
{
  "type": "https://bitstockerz.dev/errors/not-found",
  "title": "Not found",
  "status": 404,
  "detail": "The requested resource was not found.",
  "instance": "/api/strategies/999",
  "code": "NOT_FOUND",
  "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Handling internal errors (500):**  
The API never returns stack traces. `detail` is a generic message; use `requestId` when reporting issues.

---

## 1. Auth & User / Account APIs (#1)

### 1.1 Auth (implemented through Sprint 0.2)

**POST `/auth/register`**  
Create a user and issue a bearer session (dev/testing shortcut; production flow uses passkeys or OAuth).

**POST `/auth/login`**  
Issue a bearer session for an existing user by email (dev/testing shortcut).

**POST `/auth/webauthn/register/options`**  
Start passkey registration; returns challenge metadata.

**POST `/auth/webauthn/register/verify`**  
Complete passkey registration and issue a session.

**POST `/auth/webauthn/login/options`**  
Start passkey authentication; returns challenge metadata.

**POST `/auth/webauthn/login/verify`**  
Complete passkey authentication and issue a session.

**GET `/auth/oauth/google/start`**  
Start Google OAuth; returns state for the callback.

**GET `/auth/oauth/google/callback`**  
Complete Google OAuth and issue a session.

**GET `/auth/oauth/apple/start`**  
Start Apple OAuth; returns state for the callback.

**GET `/auth/oauth/apple/callback`**  
Complete Apple OAuth via GET callback.

**POST `/auth/oauth/apple/callback`**  
Complete Apple OAuth via POST callback (form-post flow).

**POST `/auth/logout`**  
Invalidate the current bearer session.

**GET `/auth/me`**  
Return the authenticated user's profile.

**GET `/me`**  
Alias for profile read (same response as `/auth/me`).

**PATCH `/me`**  
Update display preferences (`display_name`, `base_currency`). Only `USD` is accepted for `base_currency` today.

---

### 1.2 Paper Account (per user) (Planned)

**GET `/paper-account`**  
Return the current user’s paper trading account.

- Response: `{ id, base_currency, starting_balance, cash_balance, created_at }`

(Planned: create the paper account when paper trading ships — story #1.3.1 / Sprint 4.1. Registration today does not create a paper account.)

---

## 2. Market Data APIs (#2)

### 2.1 Symbols (implemented through Sprint 1.1)

Public endpoints (no authentication required).

**GET `/symbols/:symbol`**  
Lookup single symbol (equity or crypto) by ticker.

**GET `/symbols/search`**  
Typeahead search.

- Query params:
  - `q` – search string
  - `asset_type?` – EQUITY | CRYPTO
  - `limit?` – default 20, max 100

---

### 2.2 Equity OHLCV (implemented in Sprint 1.2)

Public endpoint (no authentication required). When Prisma is disabled, reads use deterministic in-memory seed candles.

**GET `/market-data/equities/candles`**

- Query params:
  - `symbol`
  - `start`
  - `end`
  - `limit?` – default `5000`, max `5000`
  - `order?` – `asc` | `desc` (default `asc`)
- Response: array of `{ date, open, high, low, close, volume }`

---

### 2.3 Crypto OHLCV (implemented in Sprint 1.2)

Public endpoint (no authentication required). When Prisma is disabled, reads use deterministic in-memory seed candles.

**GET `/market-data/crypto/candles`**

- Query params:
  - `symbol` (e.g. BTC-USD)
  - `interval` – `1d` | `1h`
  - `start`
  - `end`
  - `limit?` – default `5000`, max `5000`
  - `order?` – `asc` | `desc` (default `asc`)
- Response:
  - `1d`: `{ date, open, high, low, close, volume }`
  - `1h`: `{ timestamp, open, high, low, close, volume }`

---

### 2.5 Market Data Ingestion (implemented in Sprint 1.3)

Authenticated endpoints (bearer token required). Jobs run synchronously and return the completed job record.

**POST `/market-data/ingestion/equity`**

- Body:
  - `symbol?` – limit import to one equity ticker
- Behavior:
  - Creates and runs `equity_daily_import` job.
  - Upserts seed OHLCV bars into `equity_daily_bars` when `DATABASE_URL` is configured.

**POST `/market-data/ingestion/crypto`**

- Body:
  - `symbol?`
  - `intervals?` – `1d` | `1h` (default both)
- Behavior:
  - Creates and runs `crypto_import` job.
  - Upserts seed OHLCV bars into daily/hourly crypto tables when `DATABASE_URL` is configured.

---

### 2.6 Market Data Health (Planned — Sprint 1.4)

**GET `/market-data/health`** (admin/internal)

- Returns latest data timestamps per asset type and “staleness” flags.

---

## 3. Paper Trading APIs (#3) (Planned)

### 3.1 Orders

**POST `/trading/orders`**

- Body:
  - `symbol`
  - `side` – BUY | SELL
  - `quantity`
  - `client_order_id?`
- Behavior:
  - Validates symbol, cash/position, risk limits.
  - Fills as market order using latest price from Market Data service.

- Response:
  - `order` object:
    - `id`
    - `symbol`
    - `side`
    - `quantity`
    - `status` – PENDING | FILLED | REJECTED | CANCELLED
    - `avg_fill_price?`
    - `reject_reason?`
    - `requested_at`
    - `filled_at?`

**GET `/trading/orders`**

- Query params:
  - `status?`
  - `symbol?`
  - `limit?` (default 50)
- Response: list of orders for current user’s paper account.

---

### 3.2 Executions & Positions

**GET `/trading/executions`**

- Query params:
  - `symbol?`
  - `limit?` (default 100)
- Response: executions list:
  - `{ executed_at, symbol, side, quantity, price, notional }`

**GET `/trading/positions`**

- Returns all **non-zero** positions:
  - `{ symbol, quantity, avg_cost }`

---

### 3.3 Portfolio Summary

**GET `/trading/portfolio-summary`**

- Response:
  - `cash_balance`
  - `total_position_value`
  - `total_equity`
  - `unrealized_pnl_total`

---

## 4. Strategy Lab APIs (#4) (Planned)

Dev-only stub (not shipped scope): `POST /strategies` exists in `apps/api` and returns placeholder JSON without auth or persistence. Do not treat it as the Strategy Lab API.

### 4.1 Indicators

**GET `/strategies/indicators`**

- Response: catalog of supported indicators:
  - e.g. `[{ key: "SMA", display_name: "Simple Moving Average", params: {...} }, ...]`

---

### 4.2 Strategies

**POST `/strategies`**

- Body:
  - `name`
  - `description?`
  - `asset_type`
  - `timeframe`
  - `definition` (full JSON: indicators, entry/exit, SL/TP)
- Behavior:
  - Creates strategy + initial version.

**PUT `/strategies/:id`**

- Body:
  - same as POST (or partial, depending on design)
- Behavior:
  - Creates **new version**, updates metadata.

**GET `/strategies`**

- Response: strategies for current user:
  - `{ id, name, asset_type, timeframe, created_at, updated_at, is_active }`

**GET `/strategies/:id`**

- Response:
  - metadata + latest version’s `definition`
  - version number.

**DELETE `/strategies/:id`**

- Soft delete: sets `is_active = false`.

---

### 4.3 Strategy Validation

**POST `/strategies/validate`**

- Body:
  - `definition` OR `strategy_id`
- Response:
  - `is_valid: boolean`
  - `errors: string[]`

---

## 5. Backtesting APIs (#5) (Planned)

### 5.1 Backtest Runs

**POST `/backtests`**

- Body:
  - `strategy_id`
  - `symbol`
  - `timeframe`
  - `start_date`
  - `end_date`
  - `initial_equity?`
- Behavior:
  - Creates `backtest_run` + job.
  - Synchronously executes job (MVP).
  - Enforces bar-count, timeout limits.

- Response:
  - `backtest_run` metadata
  - `backtest_result` summary metrics

**GET `/backtests`**

- Query params:
  - `strategy_id?`
  - `symbol?`
  - `status?`
  - `limit?` (default 50)
- Response:
  - List of backtests for current user.

**GET `/backtests/:id`**

- Response:
  - `run` metadata
  - `results` (summary metrics)
  - `trades[]` (possibly paginated)
  - `equity_curve[]` – `{ timestamp, equity }`

---

## 6. AI Assistant / Kernel APIs (#6) (Planned)

All AI endpoints are **advisory**, read-only, and can be disabled by feature flag.

### 6.1 Strategy Explanations

**POST `/ai/explain-strategy`**

- Body:
  - `strategy_id`
- Response:
  - `{ explanation: string, warnings?: string[] }`

---

### 6.2 Strategy Checks

**POST `/ai/validate-strategy`**

- Body:
  - `strategy_id`
- Response:
  - `warnings: [{ severity: "LOW" | "MEDIUM" | "HIGH", message: string }]`

---

### 6.3 Backtest Explanations

**POST `/ai/explain-backtest`**

- Body:
  - `backtest_run_id`
- Response:
  - `{ explanation: string, issues?: string[] }`

---

### 6.4 Improvement Suggestions

**POST `/ai/suggest-improvements`**

- Body:
  - `strategy_id`
  - `backtest_run_id?`
- Response:
  - `suggestions: [{ title: string, description: string }]`

---

## 7. Dashboard / UI Aggregation APIs (#7) (Planned)

Most dashboard widgets reuse existing endpoints, but you may choose some light aggregations.

### 7.1 Dashboard Summary (optional helper)

**GET `/dashboard/summary`**

- Response:
  - `portfolio_summary` (from `/trading/portfolio-summary`)
  - recent `positions` (from `/trading/positions`)
  - recent `strategies` (from `/strategies`)
  - recent `backtests` (from `/backtests`)
  - recent `trades` (from `/trading/executions`)
- This can be implemented either as:
  - a true aggregator, or
  - handled client-side by calling each underlying API.

If you want to keep the backend simpler, skip this and let the Angular app call the underlying APIs independently (as designed in #7).

---

## 8. Health, Jobs, and Infra APIs (#8)

### 8.1 Health & Readiness (implemented through Sprint 0.1)

**GET `/health/live`**

- Returns `{ status: "ok" }` if process is running.

**GET `/health/ready`**

- Returns:
  - `ready: boolean` — `false` when any configured dependency check is `down`
  - `status: "ok" | "degraded"`
  - `timestamp` — ISO-8601 string
  - `checks.database` / `checks.marketData` — objects shaped as `{ status, latencyMs?, details? }` where `status` is `up` | `down` | `not_configured`
  - `checks.database` — TCP probe when `DATABASE_URL` is set; otherwise `{ status: "not_configured", details: "..." }`
  - `checks.marketData` — HTTP GET when `MARKET_DATA_HEALTH_URL` is set; otherwise `{ status: "not_configured", details: "..." }`
- HTTP **503** when `ready` is `false`

---

### 8.2 Jobs (implemented in Sprint 1.3)

**POST `/jobs`**

- Body:
  - `job_type` – `equity_daily_import` | `crypto_import` | `market_data_scheduled`
  - `symbol?`
  - `intervals?` – for `crypto_import`
- Behavior:
  - Creates and synchronously executes the job; returns final status.

**GET `/jobs/:id`**

- Returns job status for the authenticated owner.
- Response:
  - `id`
  - `job_type`
  - `status`
  - `payload`
  - `created_at`, `started_at`, `finished_at`
  - `error_message?`

Scheduled `market_data_scheduled` jobs also run hourly (`0 * * * *`) when `INGESTION_SCHEDULER_ENABLED` is effectively true: default `true` when unset and `NODE_ENV=development`; default `false` when unset in other environments; always disabled when `NODE_ENV=test`.

---

### 8.3 Test helpers (not product API)

**GET `/`** — Nest hello string from `AppController` (smoke/dev).

**GET `/error-test/*`** — Forces RFC 7807 error shapes for e2e (`unauthorized`, `forbidden`, `conflict`, `rate-limited`, `internal`). Not for clients.

---

## 9. External Data Providers

This section is about **where you actually get live/historical market data from**, beneath your `Market Data` module. These are **not** user-facing APIs; they’re internal adapters behind `/market-data/...`.

You need **two broad data domains**:

1. **US equities OHLCV (daily)**
2. **Crypto OHLCV (daily + hourly)**

### 9.1 Common provider options (high-level)

You don’t have to pick now, but architect as if any of these could sit behind your Market Data service:

- Polygon.io
- Alpha Vantage
- Twelve Data
- Tiingo
- Finnhub
- Dedicated crypto exchanges (e.g. Binance) for crypto-only legs

### 9.2 Abstraction rule

Regardless of provider, keep a strict interface on your side:

- `getEquityDailyBars(symbol, start, end)`
- `getCryptoDailyBars(symbol, start, end)`
- `getCryptoHourlyBars(symbol, start, end)`

and let **only** the provider adapter worry about:
- API keys
- Rate limits
- URL details
- Response parsing

Your internal NestJS service never leaks provider-specific types into the rest of the system.

---

## 10. Module Boundaries (High-Level)

For NestJS, a sensible module breakdown that maps to this API inventory:

**Present in `apps/api` today:** `AppConfigModule`, `AuthModule`, `MarketDataModule`, `JobsModule`, plus controllers for health, strategies stub, and error-test.

**Planned as domains grow:**

- `UserModule` / `AccountModule` (or keep under Auth)
- `TradingModule`
- `StrategyModule`
- `BacktestModule`
- `AiModule` (Kernel)
- `DashboardModule` (thin)
- `HealthModule` / `CoreModule` (if extracted from AppModule)

Each module owns the endpoints listed above in its domain.

---

**Recommended Filename:**  
`docs/database/API_Inventory.md`
