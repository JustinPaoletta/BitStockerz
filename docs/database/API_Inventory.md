# BitStockerz – Master API Inventory

Updated October 5, 2026.

This inventory describes current HTTP contracts, internal domain boundaries, and explicitly labeled design targets.
All route paths use the `/api` prefix.
Generated OpenAPI and route source define the runnable HTTP contract.
October 4 workspace additions are local changes; their final MySQL and hosted checks remain pending.

### Backend implementation status

The runnable API and Angular app include the merged Milestones 0–7 and prelaunch
Sprints 8.1–8.2. [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13)
adds P&L, chart markers, browser OAuth/profile/recovery and security hardening.
Hosting and real-provider production smoke remain outstanding.

| Area                        | Status                           | Notes                                                                                                                                                                                     |
| --------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health & readiness          | Shipped (0.1)                    | `/health/live`, `/health/ready`                                                                                                                                                           |
| Auth, sessions, profile     | Shipped (0.2, 8.1–8.2)           | Passkeys, configured Google/Apple browser OAuth, verifier-bound handoffs, explicit provider linking, bearer sessions and profile settings                                                 |
| Symbol lookup & search      | Shipped (1.1)                    | Public endpoints; in-memory seed data without `DATABASE_URL`                                                                                                                              |
| Market-data schemas         | Shipped (1.1)                    | Prisma migrations create `symbols` and OHLCV bar tables                                                                                                                                   |
| Candle read APIs            | Shipped (1.2)                    | Public equity daily and crypto daily/hourly endpoints; deterministic in-memory seed fallback without `DATABASE_URL`                                                                       |
| Jobs & ingestion            | Shipped (1.3)                    | Synchronous jobs, manual ingestion in development/test only, internal hourly scheduler                                                                                                    |
| Data health & observability | Shipped (1.4)                    | Candle sanity on ingestion, `GET /market-data/health`, in-process `GET /metrics`, `audit_events`                                                                                          |
| Strategy Lab                | Implemented (2.1–2.3)            | Owner-scoped CRUD, immutable versions/history, soft delete, public indicator catalog, canonical validation, and deterministic summaries                                                   |
| Backtest engine core        | Implemented (3.1)                | Pure, deterministic long-only simulator with indicators, rules, risk exits, metrics, and bounded resource use                                                                             |
| Backtest persistence        | Implemented (3.2)                | Prisma/MySQL + seed-mode runs, results, trades, equity points, immutable version pins, owner-scoped CAS transitions, and deterministic internal reads                                     |
| Backtest execution APIs     | Implemented (3.3)                | Authenticated synchronous run/list/detail routes, jobs integration, limits, stable failures, paging, diagnostics, metrics, logs, audit, and per-user POST rate limit                      |
| Backtest UI                 | Implemented (3.4, 5, prelaunch)  | Angular list/run/detail, equity curve with UTC trade markers, and paged trades                                                                                                            |
| Paper trading               | Implemented (4.1–4.3, prelaunch) | Default account, atomic fills, risk/idempotency, portfolio MTM, realized/total P&L and owned history                                                                                      |
| Dashboard/workflow UI       | Implemented (5)                  | Independent portfolio, strategy, execution and backtest widgets; full research/Trade workflows                                                                                            |
| Kernel AI                   | Implemented (6.1–6.3)            | Four advisory endpoints, stub/OpenAI providers, persisted daily quotas and metadata-only production logging; optional parameter change previews locally implemented under a disabled flag |
| Market-data caching         | Implemented (7.1)                | Process-local TTL caches and provider guardrails; Alpaca adapter implemented locally; credentials and live verification pending                                                           |

Without `DATABASE_URL`, auth (users, sessions, passkeys), symbol data, candle
fixtures, jobs, strategies, backtests, paper trading, AI quotas, metrics, and audit events
are in-memory.
Seed OHLCV bars roll to **today (UTC)** at process load. With MySQL, set
`DATABASE_URL` in `apps/api/.env`, run `npm run db:deploy` in `apps/api`, and
see [Local_MySQL.md](./Local_MySQL.md). Auth users, sessions, passkeys, OAuth identities, and ceremony state persist in MySQL.
They hydrate on startup, preserving user identifiers across restarts.

Successful signup paths write through to MySQL and provision the paper account.
After an API restart, sign in again with passkey/OAuth or dev email login —
do not register the same email twice. Production disables dev email shortcuts
(`AUTH_DEV_EMAIL_ENABLED=false`), legacy WebAuthn bypass
(`AUTH_LEGACY_WEBAUTHN_ENABLED=false`), forced-error routes
(`ERROR_TEST_ENABLED=false`), and OpenAPI by default (`OPENAPI_ENABLED=false`).
Development/test ingestion can upsert seed OHLCV bars into MySQL (re-run it when
the rolling seed window changes). Production never falls back to synthetic seed
prices; it serves existing database bars and reports unavailable/degraded data
when the live provider is unconfigured.

Explicitly deferred or skipped routes below are design targets, not shipped APIs.

For the generated contract covering shipped routes, run the API and open
`http://localhost:4000/api/docs`. Machine-readable OpenAPI 3.0 documents are
served at `/api/openapi.json` and `/api/openapi.yaml`. This inventory remains
the source for design rationale and planned APIs; planned routes are not added
to the generated contract until they ship.

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
  "fieldErrors": [{ "field": "email", "reason": "invalid_format" }]
}
```

- `type`, `title`, `status`, `detail`, `instance` follow RFC 7807.
- Extensions: `code` (stable), `requestId`, and optional `fieldErrors`.
- All endpoints require authentication unless explicitly stated (e.g. health
  checks, symbol lookup/search, candle reads, and the strategy indicator
  catalog). Strategy create and owner reads require a bearer session.

### 0.1 Error code catalog

Clients should branch on `code` for stable behavior; `title` and `detail` are human-facing.

| code                             | HTTP status | type suffix                      | title                            |
| -------------------------------- | ----------- | -------------------------------- | -------------------------------- |
| VALIDATION_ERROR                 | 400         | validation                       | Validation error                 |
| UNAUTHORIZED                     | 401         | unauthorized                     | Unauthorized                     |
| FORBIDDEN                        | 403         | forbidden                        | Forbidden                        |
| NOT_FOUND                        | 404         | not-found                        | Not found                        |
| STRATEGY_NOT_FOUND               | 404         | strategy-not-found               | Strategy not found               |
| STRATEGY_VERSION_NOT_FOUND       | 404         | strategy-version-not-found       | Strategy version not found       |
| STRATEGY_VALIDATION_ERROR        | 400         | strategy-validation              | Strategy validation error        |
| BACKTEST_INVALID_DEFINITION      | 400         | backtest-invalid-definition      | Invalid backtest definition      |
| BACKTEST_INSUFFICIENT_BARS       | 400         | backtest-insufficient-bars       | Insufficient backtest bars       |
| BACKTEST_BAR_LIMIT_EXCEEDED      | 400         | backtest-bar-limit-exceeded      | Backtest bar limit exceeded      |
| BACKTEST_RESOURCE_LIMIT_EXCEEDED | 400         | backtest-resource-limit-exceeded | Backtest resource limit exceeded |
| BACKTEST_TIMEOUT                 | 504         | backtest-timeout                 | Backtest timed out               |
| BACKTEST_NOT_FOUND               | 404         | backtest-not-found               | Backtest not found               |
| BACKTEST_INVALID_STATE           | 409         | backtest-invalid-state           | Invalid backtest state           |
| TRADING_ACCOUNT_INACTIVE         | 403         | trading-account-inactive         | Paper account inactive           |
| TRADING_NO_MARKET_PRICE          | 422         | trading-no-market-price          | Market price unavailable         |
| TRADING_INSUFFICIENT_CASH        | 422         | trading-insufficient-cash        | Insufficient cash                |
| TRADING_INSUFFICIENT_POSITION    | 422         | trading-insufficient-position    | Insufficient position            |
| TRADING_RISK_LIMIT               | 422         | trading-risk-limit               | Trading risk limit               |
| CONFLICT                         | 409         | conflict                         | Conflict                         |
| RATE_LIMITED                     | 429         | rate-limited                     | Rate limited                     |
| INTERNAL_ERROR                   | 500         | internal                         | Internal server error            |

- `type` is always `https://bitstockerz.dev/errors/{type suffix}`.
- `instance` is the request path (no host), e.g. `/api/strategies`.
- `requestId` is set from the `x-request-id` header when provided; otherwise the server generates a correlation ID. Use it for support and logs.
- `fieldErrors` is present for request/strategy validation errors when field
  details are available and contains `{ field, reason }` entries.

Domain-specific additions are owned by their implementation sprints and are
canonical for clients. Strategy, backtest, trading and AI codes are implemented:

| Owner                         | Codes                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sprint 2.3 (implemented)      | `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, `STRATEGY_VALIDATION_ERROR`                                                                                                                    |
| Sprints 3.1–3.3 (implemented) | `BACKTEST_INVALID_DEFINITION`, `BACKTEST_INSUFFICIENT_BARS`, `BACKTEST_BAR_LIMIT_EXCEEDED`, `BACKTEST_RESOURCE_LIMIT_EXCEEDED`, `BACKTEST_TIMEOUT`, `BACKTEST_NOT_FOUND`, `BACKTEST_INVALID_STATE` |
| Sprints 4.1–4.3 (implemented) | `TRADING_ACCOUNT_INACTIVE`, `TRADING_NO_MARKET_PRICE`, `TRADING_INSUFFICIENT_CASH`, `TRADING_INSUFFICIENT_POSITION`, `TRADING_RISK_LIMIT`                                                          |
| Sprint 6.1 (implemented)      | `AI_DISABLED`, `AI_RATE_LIMIT`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT`                                                                                                                                  |

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
    {
      "field": "asset_type",
      "reason": "asset_type must be one of EQUITY, CRYPTO"
    }
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

### 1.1 Auth (Sprint 0.2 APIs; Sprint 8.1 browser completion)

Browser OAuth uses these additional contracts. Google/Apple availability requires
complete provider configuration; the fixed SPA callback is separate from each
provider's API return URL.

| Method | Path                                      | Access                                                | Purpose                                                                     |
| ------ | ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/auth/providers`                     | Public                                                | `{ google: boolean, apple: boolean }`, no configuration secrets             |
| POST   | `/api/auth/oauth/:provider/browser/start` | Public, rate limited                                  | `{ code_challenge, return_path }` → existing OAuth start response           |
| POST   | `/api/auth/oauth/:provider/link/start`    | Same session, sign-in within five minutes             | Start explicit recovery-method linking to the authenticated user            |
| POST   | `/api/auth/oauth/session/exchange`        | Public for login; initiating bearer required for link | `{ code, verifier }` → normal auth response plus `return_path` and `intent` |

Browser callbacks redirect to the fixed SPA `/auth/oauth/callback` with a
one-use 60-second code and state in the fragment. Session bearer tokens never
appear there. State/nonce, handoffs and original session sign-in age persist in
MySQL. Redeeming a handoff requires the initiating browser's verifier; pending
links also require the same valid bearer session and attach only at redemption.

Return paths must be local application paths. Provider denial produces bounded
error identifiers. Callback codes/verifiers and provider payloads are redacted
from HTTP logs.

Provider subjects are the stable ownership keys. An email collision with an
unlinked subject requires sign-in to the existing account and explicit linking;
it never automatically attaches a provider. Verified signed claims provide new
user emails; Apple form fields cannot prove ownership. Recovery through an
already linked subject preserves the original user and paper account.

**POST `/auth/register`**  
Create a user and issue a bearer session (dev/testing shortcut when
`AUTH_DEV_EMAIL_ENABLED=true`; blocked in production). Rate-limited.

**POST `/auth/login`**  
Issue a bearer session for an existing user by email (dev/testing shortcut when
`AUTH_DEV_EMAIL_ENABLED=true`; blocked in production). Rate-limited.

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

### 1.2 Paper Account (per user) (implemented in Sprint 4.1)

**GET `/paper-account`**  
Return the current user’s paper trading account.

- Response: `{ id, base_currency, starting_balance, cash_balance, created_at }`

Successful email, passkey-registration, Google, and Apple new-user paths await
idempotent account provisioning. The read lazily heals a missing legacy
account. With MySQL enabled, auth hydration on startup preserves the user id
and therefore the linked paper account across API restarts.

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

Authenticated development/test endpoints (bearer token required); production
returns `403 FORBIDDEN`. Jobs run synchronously and return the final job record.

**POST `/market-data/ingestion/equity`**

- Body:
  - `symbol?` – limit import to one equity ticker
- Behavior:
  - Creates and runs `equity_daily_import` job.
  - In development/test, upserts provider/seed OHLCV bars into `equity_daily_bars` when MySQL is configured.

**POST `/market-data/ingestion/crypto`**

- Body:
  - `symbol?`
  - `intervals?` – `1d` | `1h` (default both)
- Behavior:
  - Creates and runs `crypto_import` job.
  - In development/test, upserts provider/seed OHLCV bars into daily/hourly crypto tables when MySQL is configured.

---

### 2.6 Market Data Health (implemented in Sprint 1.4)

**GET `/market-data/health`** (public)

- Returns:
  - `status` — `ok` | `degraded` | `unhealthy`
  - `timestamp` — ISO-8601
  - `series[]` — per asset type/interval: `latest_timestamp`, `age_ms`, `stale`, `stale_after_ms`, `symbol_count_with_data`
  - `sanity` — `{ checked, invalid, issues[] }` from a bounded sample
  - `source` — `seed` | `database`
  - `provider` — `{ configured, last_success_at, circuit, last_error_code }` (Sprint 7.1)
- Staleness thresholds via `MARKET_DATA_STALE_*_MS` (defaults: equity daily 48h, crypto daily 36h, crypto hourly 2h).
- A daily bar covers its full UTC calendar day. Its `age_ms` starts at that day's end.
  Hourly age starts at the recorded timestamp.
- Freshness and `symbol_count_with_data` consider bars for **active** symbols only (`symbol.isActive`).
- Seed OHLCV fixtures roll to **today (UTC)** at process load, so seed-mode health typically reports `ok` / `stale: false` after a restart. MySQL needs a fresh ingestion to pick up new seed dates.
- Candle/symbol reads use an in-process TTL cache (`CACHE_*`); transparent to clients. Live vendor adapter remains optional behind `MARKET_DATA_LIVE_ENABLED`.

### 2.7 Metrics Snapshot (implemented in Sprint 1.4)

**GET `/metrics`** (public)

- In-process JSON metrics include HTTP request/error counts and duration statistics, job counts/durations, backtest terminal counts/durations, and domain errors.
  Cache metrics count hits, misses, load errors, and evictions by namespace (`symbols`/`candles`). The endpoint does not emit Prometheus text.
- Cleared on process restart. Disable with `METRICS_ENABLED=false`.

### 2.8 Audit trail (implemented in Sprint 1.4)

- No public list/query API in MVP.
- Critical actions append to `audit_events` in MySQL or an in-memory ring buffer in seed mode.
  Auth events include `auth.register`, `auth.login`, and `auth.logout`.
  Job events include `job.created`, `job.completed`, `job.failed`, and `market_data.ingestion_requested`.
  Research events include `strategy.created`, `strategy.updated`, `strategy.deleted`, and `backtest.requested`.
  Trading events include `trading.order_filled` and `trading.order_rejected`.
- Audit failures never fail the primary request path; payloads redact secrets.

---

## 3. Paper Trading APIs (#3) (implemented in Sprints 4.1–4.3)

### 3.1 Orders

**POST `/trading/orders`**

- Body:
  - `symbol`
  - `side` – BUY | SELL
  - `quantity` – positive decimal string
  - `client_order_id?`
- Behavior:
  - Validates symbol, cash/position, and risk limits.
  - Fills synchronously as a market order using the latest eligible close.
  - Atomically writes the terminal order, execution (for fills), cash, and position.
  - Replaying the same `client_order_id` with the same normalized payload returns
    the original order without another fill; a different payload returns `409 CONFLICT`.
- Response `200`: `{ order }`, where `status` is `FILLED` or `REJECTED`.
  Filled orders include `avg_fill_price` / `filled_at`; rejected orders include
  the stable `reject_reason`. Business rejection is a terminal order, not an HTTP
  validation error.

**GET `/trading/orders`**

- Query params:
  - `status?`
  - `symbol?`
  - `limit?` (default 50, max 200)
  - `offset?` (default 0, max 10,000)
- Response: `{ orders, limit, offset, has_more }`, newest first by
  `requested_at DESC, id ASC`.

---

### 3.2 Executions & Positions

**GET `/trading/executions`**

- Query params:
  - `symbol?`
  - `limit?` (default 100, max 500)
  - `offset?` (default 0, max 10,000)
- Response: `{ executions, limit, offset, has_more }`, newest first by
  `executed_at DESC, id ASC`; each execution is
  `{ executed_at, symbol, side, quantity, price, notional }`.

**GET `/trading/positions`**

- Returns `{ positions }` containing all **non-zero** positions in
  `symbol ASC, position.id ASC` order. Each item is
  `{ symbol, quantity, avg_cost }`.

---

### 3.3 Portfolio Summary

**GET `/trading/portfolio-summary`**

- Response:
  - `cash_balance`
  - `total_position_value`
  - `total_equity`
  - `unrealized_pnl_total`
  - `realized_pnl_total`
  - `total_pnl`
- All fields are 2-decimal strings. If any held symbol lacks an eligible close,
  fail closed with `422 TRADING_NO_MARKET_PRICE`.
- Realized P&L = cash + remaining average-cost basis − starting balance,
  including fill cash-rounding residuals. Total P&L = equity − starting balance;
  unrealized P&L = total − realized at displayed precision. Results include all
  prior fills and survive restarts without replaying paginated history.
- Account/positions are read consistently (MySQL repeatable-read transaction or
  the seed account lock). This assumes no external deposits/withdrawals/resets.

---

## 4. Strategy Lab APIs (#4) (Sprints 2.1–2.3 implemented)

### 4.1 Indicators

**GET `/strategies/indicators`**

- Auth: public.
- Response: `{ indicators }` with code-defined entries in `SMA`, `EMA`, `RSI` order.
- Each entry has exactly `key`, `display_name`, `description`, `params`,
  `sources`, and `default_source`.
- Every current indicator has one integer `period` parameter. SMA/EMA allow
  2–200 with default 20 and sources `open|high|low|close`; RSI allows 2–100
  with default 14 and source `close`. All default to source `close`.

---

### 4.2 Strategies

**POST `/strategies`**

- Auth: required.
- Body:
  - `name`: trimmed string, 1–255 characters; unique per user under database-style case/accent-insensitive comparison
  - `description?`: string
  - `asset_type`: `EQUITY` or `CRYPTO`
  - `timeframe`: `1d` or `1h`; equity currently requires `1d`
  - `symbol_scope?`: only `SINGLE`; defaults to `SINGLE`
  - `definition`: required canonical strategy definition:
    - exactly `indicators`, `entry`, `exit`, and `risk` at the top level
    - `indicators`: at most 20 unique entries, each exactly
      `{ id, type, params: { period }, source }`; ids are 1–64 characters
      matching `^[A-Za-z][A-Za-z0-9_-]*$`.
      `type`, parameter bounds, and sources must match the catalog.
      `source` is explicit in persisted JSON
    - `entry` and `exit`: exactly `{ logic: "AND", conditions }`, with 1–10
      conditions each
    - each condition is exactly `{ left, op, right }`; each operand contains
      exactly one of `{ indicator }`, `{ price }`, or `{ literal }`
    - operators are `gt|gte|lt|lte|eq|crosses_above|crosses_below`; crossover
      conditions require at least one indicator/price operand, and indicator
      operands must reference a declared id
    - `risk`: exactly `{ stop_loss, take_profit }`; both rules are required,
      have `{ type: "percent", value }`, and use bounds `(0, 50]` for stop loss
      and `(0, 500]` for take profit
    - unknown keys, array/object confusion, duplicate ids, unsupported values,
      and non-finite numbers are rejected
- Behavior:
  - Atomically creates strategy + immutable initial version (`version_number: 1`).
  - Runs the pure canonical definition validator before either in-memory or
    MySQL persistence. Definition failures return
    `400 STRATEGY_VALIDATION_ERROR`.
    `fieldErrors[].field` is `definition` for root-shape errors or begins with `definition.` for nested errors.
    `reason` begins with a stable validator code such as `OR_NOT_SUPPORTED:`.
  - Emits `strategy.created` audit metadata.
  - Duplicate normalized name for the same user returns `409 CONFLICT`.
- Response: `{ id, name, description, asset_type, symbol_scope, timeframe, is_active, version_number, definition, summary, created_at, updated_at }`.

**PUT `/strategies/:id`**

- Body: partial metadata (`name`, `description`, `asset_type`, `timeframe`) and
  optional `definition`; `description: null` clears it and an empty body is invalid.
- Behavior:
  - Updates metadata. A present valid `definition` always appends the next
    immutable version, even when identical; a metadata-only update does not.
  - MySQL version allocation uses a serializable transaction and one bounded
    write-conflict retry.
  - Emits bounded `strategy.updated` audit metadata.
- Response: latest version payload plus deterministic `summary`.

**GET `/strategies`**

- Query: `limit?` (default 50, max 100), `offset?` (default 0, max 10,000).
- Response: `{ items, limit, offset, has_more }` for the current user’s active
  strategies, ordered `updated_at DESC, id ASC`.
- Each item is
  `{ id, name, asset_type, timeframe, version_number, created_at, updated_at, is_active }`.

**GET `/strategies/:id`**

- Auth: required; only the owning user can read the strategy.
- Response:
  - Metadata + selected version’s `definition`, `version_number`, and deterministic
    `summary`. Optional `?version=N` reads an immutable historical definition
    and adds `version_created_at` plus `is_latest`.
- Invalid UUID returns `400 VALIDATION_ERROR`; missing, inactive, or non-owned
  ids return `404 STRATEGY_NOT_FOUND`; a missing selected version returns
  `404 STRATEGY_VERSION_NOT_FOUND`.

**DELETE `/strategies/:id`**

- Soft delete: sets `is_active = false` and returns `204` with no body. A repeated
  delete returns `404 STRATEGY_NOT_FOUND`; the name remains reserved.
- Emits bounded `strategy.deleted` audit metadata.

---

### 4.3 Strategy Validation

**POST `/strategies/validate`**

- Body:
  - Exactly one of `definition` or `strategy_id`
- Response:
  - `is_valid: boolean`
  - `errors: [{ path, code, message }]`
  - `summary: string | null`
- Valid and invalid definitions return `200`; the endpoint never persists.
- Both/neither fields return `400 STRATEGY_VALIDATION_ERROR`. Missing,
  inactive, or non-owned `strategy_id` returns `404 STRATEGY_NOT_FOUND`.

---

## 5. Backtesting APIs (#5) (implemented through Sprint 3.3)

Sprint 3.1 implements the internal `BacktestModule`,
`BacktestEngineService`, and pure `runBacktest` contract. It accepts a validated
strategy definition plus chronological OHLCV bars and returns closed trades,
one equity point per bar, summary metrics, and bounded diagnostics.

Sprint 3.2 adds the internal owner-scoped `BacktestsService` and
`BacktestsRepository`. They create pending runs with immutable owned strategy
version pins and compare-and-set lifecycle states.
Completion transactionally persists one result and ordered trades/equity points in MySQL; seed mode uses copy-on-write.

Active strategy-asset-compatible symbols and optional owner-scoped jobs are
validated consistently. Persisted auth hydration preserves ownership after restart. Initial equity must already be cent-exact. Other decimal-backed
values are fixed-scale strings at this boundary.

Completion validates the raw engine summary before rounding.
It then recomputes stored summary metrics from the fixed-scale detail rows. Latest pins enforce current strategy
timeframe; explicit internal
historical pins persist their supplied valid timeframe because strategy
versions snapshot definitions, not mutable metadata.

Sprint 3.3 adds authenticated execution, DTO validation, per-user POST limits, the `backtest_run` handler, and batched market reads.
It also adds cancellation/deadlines, resource limits, terminal cleanup, stable failures, diagnostics, metrics, logs, and bounded audit metadata. Sprint 3.4 consumes these routes from `apps/web`.

### 5.1 Backtest Runs

**POST `/backtests`**

- Body:
  - `strategy_id`
  - `symbol`
  - `timeframe`
  - `start_date`
  - `end_date`
  - `initial_equity?`
  - `strategy_version_id?`
  - `simulation?`: pinned allocation, costs, execution timing, and evaluation-period settings
- Behavior:
  - Validates ownership and strategy/symbol/timeframe compatibility, pins a
    strategy version, then creates a run + job.
  - Synchronously executes job (MVP).
  - Enforces bar-count, series-cell, and cooperative deadline limits.
- Response `200`: `{ run, results }`; full trades/equity remain on detail.
- Date-only values normalize to inclusive UTC day boundaries. Timestamp values
  must carry `Z` or an explicit offset and `end_date` must be after
  `start_date`.
- `initial_equity` defaults to `10000` and must be positive with at most two
  decimal places.
- Rate limit: per authenticated user, POST only; defaults to 10 requests per
  60 seconds via `BACKTEST_RATE_LIMIT_*`.

**GET `/backtests`**

- Query params:
  - `strategy_id?`
  - `symbol?`
  - `status?`
  - `limit?` (default 50, max 100)
  - `offset?` (default 0, max 10,000)
- Response: `{ items, limit, offset, has_more }` for the current user, ordered
  `created_at DESC, id ASC`.
- Each item includes `strategy_name`, symbol text, status/lifecycle fields, and
  available summary metrics, but not trades or equity points.

**GET `/backtests/:id`**

- Query: `trades_limit?` (default 500, max 1000),
  `trades_offset?` (default 0, max 100,000).
- Response:
  - `run` metadata
  - `results` (summary metrics)
  - `trades[]`, ordered by `entry_time ASC, id ASC`
  - `trades_page: { limit, offset, has_more }`
  - `equity_curve[]` – `{ timestamp, equity }`
- When `trades_page.has_more` is true, request the next page by advancing
  `trades_offset` by the number of trade rows already loaded. Stable trade ids
  allow clients to de-duplicate defensively while appending.
- Missing and cross-owner ids both return `404 BACKTEST_NOT_FOUND`.

---

## 6. AI Assistant / Kernel APIs (#6) (Implemented — Milestone 6)

All AI endpoints are **advisory**, read-only, and can be disabled by feature flag
(`AI_ENABLED`, default false). Stub mode uses `AI_PROVIDER=stub`.

### 6.1 Strategy Explanations

**POST `/ai/explain-strategy`** (implemented)

- Body:
  - `strategy_id`
- Response:
  - `{ disclaimer, confidence, ai_request_id, explanation, warnings }`

---

### 6.2 Strategy Checks

**POST `/ai/validate-strategy`** (implemented)

- Body:
  - `strategy_id`
- Response:
  - `{ disclaimer, confidence, ai_request_id, warnings }`, where warnings are
    `{ code, severity, message, evidence_paths }`

---

### 6.3 Backtest Explanations

**POST `/ai/explain-backtest`** (implemented)

- Body:
  - `backtest_run_id`
- Response:
  - `{ disclaimer, confidence, ai_request_id, explanation, issues }`

---

### 6.4 Improvement Suggestions

**POST `/ai/suggest-improvements`** (implemented; optional parameter previews behind `AI_DIFF_SUGGESTIONS_ENABLED`)

- Body:
  - `strategy_id`
  - `backtest_run_id?`
- Response:
  - `{ disclaimer, confidence, ai_request_id, suggestions }`, where suggestions
    are `{ code, title, description, evidence }`.
  - With the optional flag enabled: `diff: { summary, changes: [{ path, from, to, rationale }] }`.

---

### 6.5 Output bounds and interpretation

Explanations contain 1–4000 characters.
Warnings/issues have codes matching `^[A-Z][A-Z0-9_]{0,63}$`, severity, messages of 1–500 characters, and at most 10 evidence strings.
Each evidence string contains 1–200 characters.
Provider schemas permit at most 10 warnings/issues and five suggestions.
Suggestion titles contain 1–120 characters; descriptions contain 1–1000 characters.
Deterministic issues take precedence for duplicate codes; model-only high severity is reduced to medium.

| Deterministic issue | Condition                                                       |
| ------------------- | --------------------------------------------------------------- |
| `SHORT_SAMPLE`      | Available job diagnostics report fewer than 100 processed bars. |
| `TOO_FEW_TRADES`    | Fewer than five closed trades.                                  |
| `HIGH_DRAWDOWN`     | Drawdown of at least 25%.                                       |
| `NEGATIVE_RETURN`   | Total return below zero.                                        |
| `CONCENTRATED_PNL`  | One winner contributes more than 50% of positive P&L.           |

Kernel resolves the owned immutable version through the run's `strategyVersionId`.
Backtest context includes its version ID, version number, and definition summary.
Edits, renames, and soft deletion do not replace that historical context.
Parameter previews target the currently selected strategy definition.

---

## 7. Dashboard / UI Aggregation APIs (#7) (No new backend route planned)

Dashboard widgets make independent calls to the paper-account, trading, strategy,
and backtest APIs so one failed widget does not fail the page.

### 7.1 Dashboard Summary

`GET /dashboard/summary` is intentionally skipped for MVP. Sprint 5.2 calls
`/trading/portfolio-summary`, `/trading/positions`,
`/strategies?limit=5&offset=0`, `/backtests?limit=5&offset=0`, and
`/trading/executions?limit=5&offset=0` independently.

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
  - `checks.database` — Prisma `SELECT 1` when MySQL is configured; `not_configured` is allowed only outside production. Production requires an active persistence adapter and returns bounded details rather than raw driver errors.
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
  - Development/test only: creates and synchronously executes the job; returns final status. Production returns `403 FORBIDDEN`.

**GET `/jobs/:id`**

- Returns job status for the authenticated owner.
- Response:
  - `id`
  - `job_type`
  - `status`
  - `payload`
  - `created_at`, `started_at`, `finished_at`
  - `error_message?`

Scheduled `market_data_scheduled` jobs run hourly (`0 * * * *`) when scheduling is enabled.
When unset, `INGESTION_SCHEDULER_ENABLED` defaults true in development and false elsewhere.
Scheduling is always disabled in test mode.
Paper runners share that setting and evaluate hourly at minute 20 in database mode.

---

### 8.3 Test helpers (not product API)

**GET `/`** — Nest hello string from `AppController` (smoke/dev).

**GET `/error-test/*`** — Forces RFC 7807 error shapes for e2e (`unauthorized`, `forbidden`, `conflict`, `rate-limited`, `internal`). Not for clients.

---

## 9. External Data Providers

Providers are internal adapters beneath the market-data module.
They supply equity daily and crypto daily/hourly historical bars.

You need **two broad data domains**:

1. **US equities OHLCV (daily)**
2. **Crypto OHLCV (daily + hourly)**

### 9.1 Provider setup and live verification remain outstanding

`LiveMarketDataProvider` implements Alpaca equity daily and US crypto daily/hourly
bars. Host credentials, feed entitlement, legitimate display/redistribution rights
and live smoke remain owner setup. An operator licensed-data JSON importer is also
available. Production never substitutes seed data. See
[product extensions](../product/PRODUCT_EXTENSIONS.md).

### 9.2 Abstraction rule

Regardless of provider, keep a strict interface on your side:

- `fetchEquityDaily(symbolId, symbol)`
- `fetchCryptoDaily(symbolId, symbol)`
- `fetchCryptoHourly(symbolId, symbol)`

and let **only** the provider adapter worry about:

- API keys
- Rate limits
- URL details
- Response parsing

Your internal NestJS service never leaks provider-specific types into the rest of the system.

---

## 10. Module Boundaries (High-Level)

For NestJS, a sensible module breakdown that maps to this API inventory:

**Present in `apps/api`:** `AppConfigModule`, `AuthModule`,
`MarketDataModule`, `JobsModule`, `ObservabilityModule`, `StrategiesModule`,
`BacktestModule`, `TradingModule`, `AiModule`, `ProductModule`, and `AutomationModule`, plus health and gated test
controllers. Profile remains under auth and dashboard widgets reuse domain APIs.

**Planned as domains grow:**

- `UserModule` / `AccountModule` (or keep under Auth)
- `DashboardModule` (no aggregation route is required by the current UI)
- `HealthModule` / `CoreModule` (if extracted from AppModule)

Each module owns the endpoints listed above in its domain.

---

### Manual ingestion production boundary

`POST /jobs`, `POST /market-data/ingestion/equity` and
`POST /market-data/ingestion/crypto` are authenticated development/test tools and
return `403 FORBIDDEN` in production. Production ingestion runs through the internal
scheduler. Request DTOs reject unknown fields, malformed symbols (max 32 characters),
and interval arrays other than one or two unique values from `1d` / `1h`.
Owned job reads remain available to authenticated users.

## October 4 workspace API additions

All paths use `/api`, bearer authentication, strict DTOs and owner scoping.

| Method/path                                                            | Behavior                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| GET `/backtests/:id/research`                                          | Pinned definition/version/settings/results, even after strategy soft deletion |
| GET `/backtests/:id/trades.csv`, `/backtests/:id/results.csv`          | Complete owned trades or research row                                         |
| GET `/trading/executions.csv`                                          | Complete owned history, maximum 100,000 rows                                  |
| GET/POST `/workspace/watchlist`; DELETE `/workspace/watchlist/:symbol` | Owned saved symbols                                                           |
| GET `/workspace/chart`                                                 | Symbol/timeframe/UTC range candles and optional owned strategy overlays       |
| GET `/workspace/prices/:symbol`                                        | Latest close and timestamp with data-mode label                               |
| POST `/workspace/paper/reset`                                          | Fresh session, `confirmation: RESET`, archived ledger and retired order keys  |
| GET `/workspace/paper/archives`                                        | Owned reset archives                                                          |
| GET `/workspace/account-export`                                        | Owned personal JSON with secrets excluded                                     |
| DELETE `/workspace/account`                                            | Fresh session, exact email confirmation; rejects active jobs                  |
| GET `/me/security/sessions`; DELETE `/me/security/sessions/:id`        | Hashed IDs, owner revocation                                                  |
| GET `/me/security/passkeys`                                            | Hashed credential IDs and creation time                                       |
| POST `/me/security/passkeys/options`, `/me/security/passkeys/verify`   | Fresh-session, user/session/purpose-bound enrollment                          |
| DELETE `/me/security/passkeys/:id`                                     | Fresh-session removal with remaining sign-in method                           |
| GET/POST `/automations`                                                | Owned version-pinned paused paper runners                                     |
| POST `/automations/:id/control`, `/automations/:id/evaluate`           | Active/paused/stopped controls and latest-completed-bar evaluation            |

Backtest POST accepts optional `simulation`: allocation percent, commission and
slippage basis points, `signal_close`/`next_open`, `research`/`out_of_sample`.
Results can include benchmark; trades include total per-trade `fees_abs`. See
[extension contracts](../product/PRODUCT_EXTENSIONS.md) for limits and semantics.
