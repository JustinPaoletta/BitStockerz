# BitStockerz – Master API Inventory

This document is a **master API inventory** derived from the MVP stories **#1–#8**.
It describes:

- Internal HTTP APIs (what your Angular app and services call)
- Internal service boundaries (where NestJS modules should exist)
- External data providers (for market data, at a high level)

It’s organized by domain, not by story number.

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
  "instance": "/strategies",
  "code": "VALIDATION_ERROR",
  "requestId": "uuid-or-correlation-id",
  "fieldErrors": [
    { "field": "email", "reason": "invalid_format" }
  ]
}
```

- `type`, `title`, `status`, `detail`, `instance` follow RFC 7807.
- Extensions: `code` (stable), `requestId`, and optional `fieldErrors`.
- All endpoints require authentication unless explicitly stated (e.g. health checks).

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

### 1.1 Auth

**POST `/auth/register`**  
Create a new user account.

**POST `/auth/login`**  
Authenticate and return token/session.

**POST `/auth/logout`**  
Invalidate current session/token.

**GET `/auth/me`**  
Return current user profile.

---

### 1.2 Paper Account (per user)

**GET `/paper-account`**  
Return the current user’s paper trading account.

- Response: `{ id, base_currency, starting_balance, cash_balance, created_at }`

(Internal creation of the account happens on user registration.)

---

## 2. Market Data APIs (#2)

### 2.1 Symbols

**GET `/symbols/:symbol`**  
Lookup single symbol (equity or crypto) by ticker.

**GET `/symbols/search`**  
Typeahead search.

- Query params:
  - `q` – search string
  - `asset_type?` – EQUITY | CRYPTO
  - `limit?` – default 20

---

### 2.2 Equity OHLCV

**GET `/market-data/equities/candles`**

- Query params:
  - `symbol`
  - `start`
  - `end`
  - `limit?`
  - `order?` – `asc` | `desc`
- Response: array of `{ date, open, high, low, close, volume }`

---

### 2.3 Crypto OHLCV

**GET `/market-data/crypto/candles`**

- Query params:
  - `symbol` (e.g. BTC-USD)
  - `interval` – `1d` | `1h`
  - `start`
  - `end`
  - `limit?`
  - `order?`
- Response:
  - `1d`: `{ date, open, high, low, close, volume }`
  - `1h`: `{ timestamp, open, high, low, close, volume }`

---

### 2.4 Market Data Health

**GET `/market-data/health`** (admin/internal)

- Returns latest data timestamps per asset type and “staleness” flags.

---

## 3. Paper Trading APIs (#3)

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

## 4. Strategy Lab APIs (#4)

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

## 5. Backtesting APIs (#5)

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

## 6. AI Assistant / Kernel APIs (#6)

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

## 7. Dashboard / UI Aggregation APIs (#7)

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

### 8.1 Health & Readiness

**GET `/health/live`**

- Returns `{ status: "ok" }` if process is running.

**GET `/health/ready`**

- Returns:
  - DB status
  - Market data service status
  - Any other readiness checks

---

### 8.2 Jobs (Backtest)

Jobs are mostly internal, but you may expose read-only endpoints.

**GET `/jobs/:id`** (optional MVP)

- Response:
  - `id`
  - `job_type`
  - `status`
  - `created_at`, `started_at`, `finished_at`
  - `error_message?`

In MVP, because backtests are synchronous, this is nice-to-have rather than critical.

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

- `AuthModule`
- `UserModule` / `AccountModule`
- `MarketDataModule`
- `TradingModule`
- `StrategyModule`
- `BacktestModule`
- `AiModule` (Kernel)
- `DashboardModule` (thin)
- `JobsModule`
- `HealthModule`
- `ConfigModule` / `CoreModule`

Each module owns the endpoints listed above in its domain.

---

**Recommended Filename:**  
`docs/database/API_Inventory.md`
