# Sprint 4.2 — Orders & Executions

**Status:** Plan ready  
**Roadmap marker:** Milestone 4 – Paper Trading (orders engine)  
**Branch:** `feat/sprint-4-2-orders-executions`  
**PR base:** `feat/sprint-4-1-accounts-positions`

**Overview:** Add `orders` + `executions` tables and a single write path — `POST /trading/orders` — that validates risk limits, fills market orders at the latest market-data close, updates cash/positions atomically, and supports idempotent `client_order_id`. Long-only, fractional qty allowed, seed + MySQL parity.

---

## Sprint scope and exit criteria

**Stories**

| ID | Title | Source |
|----|-------|--------|
| #3.2.1 | Order schema | [MVP_03](../product/stories/BitStockerz_MVP_03_Paper_Trading_Stories.md) |
| #3.2.2 | Place market order | same + [API_Inventory §3.1](../database/API_Inventory.md) |
| #3.3.1 | Execution records | same |
| #3.6.1 | Risk limits | same |
| #3.6.2 | Idempotent order submission | same |

**Exit:** Authenticated user can place market BUY/SELL that fills instantly (or rejects with reason), leaves an execution, and mutates cash + positions correctly. Replaying the same `client_order_id` returns the original order.

**Explicitly out of scope**

| Item | Why deferred |
|------|----------------|
| Limit / stop / cancel / partial fills | MVP market-only |
| GET list APIs (orders, executions, positions, portfolio) | Sprint 4.3 |
| Short selling / margin | JC-6 from 4.1 |
| Live broker / vendor execution | Simulated fill only |
| Soft reset account | JC-5 deferred |
| Angular trade ticket | Milestone 5 |
| Exhaustive cross-domain error-catalog test | Sprint 4.3 (#8.3.2); canonical trading codes are already added in 4.1/4.2 |

---

## Prerequisites

| Capability | Location | Relevance |
|------------|----------|-----------|
| Paper account + `TradingLedgerService` | Sprint 4.1 `TradingModule` | Mutated through one atomic fill boundary |
| `ensureUserPersisted` | `auth.service.ts` | FK safety if any user-scoped writes |
| Symbols lookup | `MarketDataService` / symbols | Resolve ticker → `symbol_id` + asset type |
| Candles (seed + DB) | `market-data.service.ts`, `seed-candles.ts` | Latest close for fill price (JC-1) |
| AuthGuard | `auth.guard.ts` | Guard POST |
| DDL orders/executions | [DDL/02_trading.sql](../database/DDL/02_trading.sql) | Schema source |
| Migrations plan §4.2 | [Migrations_Plan.md](../database/Migrations_Plan.md) | V0402 orders, V0403 executions |
| RFC 7807 | `DomainError`, `ErrorCode` | Rejects & validation |
| Coverage 90% | `package.json` | Order path is critical path |

---

## Acceptance criteria (implementation contract)

### #3.2.1 – Order schema

- Prisma models + migrations for `orders` and `executions` matching DDL.
- Columns used: `id` (UUID), `paper_account_id`, `symbol_id`, `side` (`BUY`|`SELL`), `quantity` `DECIMAL(18,8)`, `order_type` (`MARKET` only), `status` (`PENDING`|`FILLED`|`REJECTED`|`CANCELLED`), `avg_fill_price`, `reject_reason`, `client_order_id`, `requested_at`, `filled_at`.
- Unique `(paper_account_id, client_order_id)` — MySQL allows multiple NULLs; application treats missing `client_order_id` as non-idempotent.
- Seed mode: in-memory order/execution stores keyed by account.

### #3.2.2 – Place market order

- `POST /api/trading/orders` (AuthGuard).
- Body: `symbol`, `side`, `quantity`, `client_order_id?`. `quantity` is a decimal string only, with 1–8 fractional digits, `> 0`, and within `DECIMAL(18,8)`; `client_order_id` is trimmed, 1–64 characters when present.
- Resolve symbol (active only); unknown/inactive symbols → `404 NOT_FOUND`.
- An inactive paper account fails before order insertion with `403 TRADING_ACCOUNT_INACTIVE`; it is not a persisted business rejection.
- **Market only** — the request DTO has no `order_type`; reject `order_type` and all other unknown fields through strict DTO whitelisting, and persist `order_type = MARKET`.
- Fill price = latest close per JC-1 (see Judgement calls).
- Reject a non-positive or stale close using the existing market-data freshness thresholds. Seed data is anchored to current UTC, so seed e2e remains deterministic enough when the test clock is injected.
- Happy path (single serializable transaction when Prisma on):
  1. Lock/re-read the paper account and fail with `TRADING_ACCOUNT_INACTIVE` before inserting an order if inactive.
  2. Re-check idempotency inside the transaction, then insert an internal `PENDING` row to claim `client_order_id`; it must be updated to terminal before commit, so clients never observe durable `PENDING` (JC-11).
  3. Risk checks (#3.6.1).
  4. Cash/position apply through 4.1 `TradingLedgerService.applyFill` using the same transaction context and 2dp cash notional.
  5. Insert execution (#3.3.1).
  6. Set order `FILLED`, `avg_fill_price`, `filled_at`.
- On a documented business reject, persist an order row as `REJECTED` with the stable `reject_reason` and return it with HTTP 200 (JC-12).
- Response includes order object (API contract). After the transaction commits, await non-throwing `AuditService.record` for `trading.order_filled` or `trading.order_rejected`; never emit “filled” before commit.

### #3.3.1 – Execution records

- One execution per filled market order (full fill).
- Fields: UUID `id`, `order_id`, `paper_account_id`, `symbol_id`, `side`, `quantity`, `price`, `executed_at`.
- Notional for API later = `quantity * price` (computed, not stored).
- Unit tests: execution created iff FILLED; none on REJECTED.

### #3.6.1 – Risk limits

Configurable defaults (env / `AppConfig`):

| Limit | Env | Default | Behavior |
|-------|-----|---------|----------|
| Max order notional | `TRADING_MAX_ORDER_NOTIONAL` | `25000` | Reject if `qty * price > max` |
| Max position % of equity | `TRADING_MAX_POSITION_PCT` | `25` | Reject BUY if resulting symbol position value / pre-trade total equity &gt; pct |
| Min cash remaining | `TRADING_MIN_CASH_REMAINING` | `0` | Reject BUY if `cash - roundedCashNotional < min` |

- SELL checks: sufficient position qty; no short (JC-6).
- Quantity &gt; 0; max 8 decimal places; both equity and crypto allow fractional (JC-3).
- Missing/stale/non-positive price data → persist the business reject reason `NO_MARKET_PRICE`; direct price-dependent read paths use canonical `TRADING_NO_MARKET_PRICE`.
- Compute max-order-notional from unrounded `qty * price`; compute cash constraints and ledger changes from the same 2dp `ROUND_HALF_UP` cash notional. Pre-trade total equity is cash + all positions at the same price snapshot used by the request.
- Persisted business reject reasons are stable: `NO_MARKET_PRICE`, `MAX_ORDER_NOTIONAL`, `MAX_POSITION_PCT`, `MIN_CASH_REMAINING`, `INSUFFICIENT_CASH`, `INSUFFICIENT_POSITION`.

### #3.6.2 – Idempotent order submission

- When `client_order_id` present: lookup by `(paper_account_id, client_order_id)`.
- If it exists and normalized `symbol`, `side`, and exact decimal `quantity` match: return **200** with original order — **do not** re-fill or mutate cash.
- If it exists with a different request payload: return `409 CONFLICT`; never replay a semantically different order under the same key.
- If concurrent inserts race: unique constraint → load winner and return (same as jobs unique handling).
- Missing `client_order_id`: always new order.
- E2E: POST twice with same id → identical `id` / balances unchanged on second call.

---

## API contract

### `POST /api/trading/orders` (#3.2.2)

| Concern | Decision |
|---------|----------|
| Auth | Required |
| Content-Type | `application/json` |

**Request:**

```json
{
  "symbol": "AAPL",
  "side": "BUY",
  "quantity": "10.5",
  "client_order_id": "ui-2026-07-25-001"
}
```

**Response `200` (filled):**

```json
{
  "order": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "symbol": "AAPL",
    "side": "BUY",
    "quantity": "10.50000000",
    "status": "FILLED",
    "avg_fill_price": "198.45000000",
    "requested_at": "2026-07-25T15:10:00.000Z",
    "filled_at": "2026-07-25T15:10:00.000Z",
    "client_order_id": "ui-2026-07-25-001"
  }
}
```

**Response `200` (rejected — JC-12):**

```json
{
  "order": {
    "id": "…",
    "symbol": "AAPL",
    "side": "BUY",
    "quantity": "1000000",
    "status": "REJECTED",
    "reject_reason": "MAX_ORDER_NOTIONAL",
    "requested_at": "2026-07-25T15:10:00.000Z",
    "client_order_id": "ui-big-order"
  }
}
```

Business rejects return the documented HTTP 200 terminal order (JC-12). DTO errors (bad side/decimal/client id), unknown/inactive symbols, inactive accounts, and idempotency-key payload conflicts do not create an order row and use RFC 7807.

**Canonical HTTP error codes** (added in 4.1/4.2 and exhaustively catalog-tested in 4.3):

| Code | HTTP | When |
|------|------|------|
| `VALIDATION_ERROR` | 400 | Bad DTO |
| `UNAUTHORIZED` | 401 | No session |
| `NOT_FOUND` | 404 | Unknown/inactive symbol; missing paper accounts are healed through Sprint 4.1 provisioning |
| `CONFLICT` | 409 | Existing `client_order_id` has a different normalized request |
| `TRADING_ACCOUNT_INACTIVE` | 403 | Paper account is inactive; no order row is created |
| `TRADING_NO_MARKET_PRICE` | 422 | Reserved for read/valuation paths; order placement persists `NO_MARKET_PRICE` reject |
| `TRADING_INSUFFICIENT_CASH` | 422 | Reserved for direct ledger callers; order placement persists reject |
| `TRADING_INSUFFICIENT_POSITION` | 422 | Reserved for direct ledger callers; order placement persists reject |
| `TRADING_RISK_LIMIT` | 422 | Reserved generic risk code; order placement persists a specific reject reason |

### Seed mode behavior

| Step | Seed | MySQL |
|------|------|-------|
| Price | Latest close from seed candle arrays | Latest close from bar tables |
| Order/exec persist | In-memory maps | Prisma transaction |
| Idempotency | Map key `(accountId, clientOrderId)` | Unique index |
| Symbols | Seed symbols | `symbols` table |

---

## Architecture

```mermaid
sequenceDiagram
  participant C as Client
  participant OC as OrdersController
  participant OS as OrdersService
  participant MD as MarketDataService
  participant PA as PaperAccountsService
  participant L as TradingLedgerService
  participant DB as Prisma / memory

  C->>OC: POST /trading/orders
  OC->>OS: placeMarketOrder
  OS->>PA: get account
  OS->>OS: fast idempotency lookup
  OS->>MD: latestClose(symbol)
  OS->>OS: riskLimits
  OS->>DB: serializable tx + idempotency claim
  alt pass
    OS->>L: applyFill(tx, account, fill)
    L->>DB: cash + position in same tx
    OS->>DB: execution + order FILLED in same tx
  else fail
    OS->>DB: order REJECTED in same tx
  end
  OS->>OS: await post-commit audit
  OS-->>C: order JSON
```

**Concrete files**

| Path | Action |
|------|--------|
| `apps/api/prisma/schema.prisma` | `Order`, `Execution` models + relations |
| `apps/api/prisma/migrations/*_sprint_4_2_orders/` | `orders` |
| `apps/api/prisma/migrations/*_sprint_4_2_executions/` | `executions` |
| `apps/api/src/trading/orders.controller.ts` | POST |
| `apps/api/src/trading/orders.service.ts` | Place + idempotency |
| `apps/api/src/trading/order-risk.service.ts` | Limits |
| `apps/api/src/trading/dto/place-order.dto.ts` | Validation |
| `apps/api/src/trading/fill-price.service.ts` | JC-1 latest close |
| `apps/api/src/market-data/market-data.service.ts` | Add `getLatestClose(symbol)` helper if missing |
| `apps/api/src/config/app-config.service.ts` | Trading risk env |
| `apps/api/.env.example` | Document risk env names |
| `apps/api/src/auth/auth.service.ts` | Remap must reassign orders/executions `paper_account` ownership via account.user_id only (orders FK account, not user) |
| `apps/api/src/common/errors/error-codes.enum.ts` | Add canonical `TRADING_*` codes named in 4.1/4.2 |
| `apps/api/test/app.e2e-spec.ts` | Buy → reject → idempotent replay |

---

## Implementation plan (ordered)

### 1. Schema + config

1. Prisma models + migrations (orders then executions).
2. Risk config keys + defaults + unit tests for parsing.
3. AC bullets into MVP_03.

### 2. Fill price helper (JC-1)

1. `getLatestClose(symbol): { price, asOf, interval }`.
2. Equity → equity daily close; crypto → crypto **daily** close by default; if symbol only has hourly series in seed, fall back to latest hourly close.
3. Unit tests with injected candle fixtures / mocked MarketDataService.

### 3. Risk service (#3.6.1)

1. Pure functions where possible for coverage.
2. Cases: max notional, max position %, min cash, insufficient position, qty validation.

### 4. OrdersService (#3.2.2 / #3.3.1 / #3.6.2)

1. Fast idempotency lookup, followed by the authoritative in-transaction lookup/claim and payload comparison.
2. Transactional fill path calling 4.1 transaction-scoped ledger helper.
3. REJECTED persistence (JC-12).
4. Use Prisma `Serializable` isolation with bounded retry for `P2034` write conflicts; the in-memory path uses a per-account mutex/copy-on-write commit so concurrent seed requests cannot double-spend.
5. Audit hooks (non-throwing, awaited after commit).
6. Unit tests: buy, sell, cash rounding, reject reasons, same-payload replay, mismatched-payload conflict, concurrent unique race, and concurrent double-spend.

### 5. Controller + e2e + smoke

1. DTO validation (class-validator): side enum, quantity decimal string (not JSON number), client_order_id trimmed/non-empty/max 64.
2. E2E seed mode: register → buy AAPL → GET paper-account cash decreased → replay client_order_id.
3. Extend smoke script with authenticated order if feasible.

### 6. Docs

| File | Update |
|------|--------|
| `API_Inventory.md` | Mark POST `/trading/orders` implemented |
| `Migrations_Plan.md` | Prisma folder names |
| `manual_testing.md` | Place order + reject + idempotency |
| `ROADMAP.md` / MVP_03 / CHANGELOG | Status |

### 7. Gates

Same verify script as 4.1; MySQL path must prove unique idempotency index.

---

## Best-practice checklist

- [ ] Single DB transaction for fill side effects ([Prisma interactive transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions))
- [ ] Idempotency via unique `(paper_account_id, client_order_id)` ([API Inventory §3](../database/API_Inventory.md))
- [ ] DECIMAL qty/price; no float notional
- [ ] Latest close only from market-data module (no hard-coded prices)
- [ ] Risk limits env-configurable with safe defaults
- [ ] AuthGuard + ownership via caller’s paper account only
- [ ] Audit never breaks order path
- [ ] Seed/DB parity for fill price + balances
- [ ] Coverage ≥90% on risk + orders services
- [ ] Conventional Commits; PR onto 4.1 branch

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Stale / missing candles → bad fills | Reject with `NO_MARKET_PRICE`; document seed roll-forward |
| Double-spend on concurrent BUY | Transaction + row lock / serializable on account; unique client id |
| Avg-cost bugs on partial sells | Reuse 4.1 unit-tested helpers; add integration cases |
| Position % needs MTM of all positions | Batch latest closes; cap symbol set; fail closed if any price missing for held symbols |
| REJECTED vs HTTP error UX confusion | Document JC-12; OpenAPI/inventory note |
| Business reject reasons drift from HTTP domain codes | Keep the reject-reason enum and canonical `TRADING_*` catalog in one module with exhaustive tests |

---

## Adopted defaults and override triggers

| # | Blocker | Why | Default | Status |
|---|---------|-----|---------|--------|
| 1 | Fill interval for crypto (daily vs hourly) | Strategy timeframe unused until Milestone 3/5 | Daily close; hourly fallback | Adopted |
| 2 | Reject as 200+REJECTED vs 422 Problem Details | Client contract | 200 + `status: REJECTED` | Adopted |
| 3 | Risk default numbers ($25k / 25% / $0) | Product appetite | Table defaults | Adopted |
| 4 | Fractional equity shares | Broker realism vs demo UX | Allow decimals both | Adopted |
| 5 | Persist REJECTED rows | History noise | Persist | Adopted |

---

## Judgement calls

### JC-1 — Fill price source
- **Decision:** Use **last available close** for the symbol’s primary MVP series: equity → **equity daily**; crypto → **crypto daily**; if daily missing but hourly exists → **latest hourly close**. Do **not** use open/high/low or VWAP.
- **Why:** Inventory says “latest price from Market Data”; daily is the common MVP bar; hourly fallback keeps crypto demos working.
- **Discuss before implement if:** Product wants strategy timeframe-aware fills (needs strategy context on the order) or bid/ask simulation.

### JC-2 — Risk limit defaults
- **Decision:** `max_order_notional = 25000`, `max_position_pct = 25`, `min_cash_remaining = 0` (USD).
- **Why:** Guardrails without blocking $100k paper demos (can buy ~4 full-sized tickets before %/notional bind).
- **Discuss before implement if:** Stricter retail-like limits or looser “unlimited paper” for backtest parity.

### JC-3 — Fractional quantity
- **Decision:** Allow **decimal quantity** for **both** equity and crypto (`DECIMAL(18,8)`, qty &gt; 0).
- **Why:** Crypto requires fractions; equity fractions simplify demos and match schema; no lot-size table in MVP.
- **Discuss before implement if:** Equities must be whole shares only for “realism.”

### JC-6 — Long-only (confirm)
- **Decision:** Reaffirm 4.1 — SELL cannot exceed position; no short open.
- **Why:** Paper MVP scope.
- **Discuss before implement if:** Shorts required.

### JC-11 — Sync terminal status
- **Decision:** No durable `PENDING` for market orders; write `FILLED` or `REJECTED` in one request.
- **Why:** Fill is synchronous against local candles.
- **Discuss before implement if:** Async job-based execution is desired (would use jobs module).

### JC-12 — Reject representation
- **Decision:** Persist `REJECTED` order; return HTTP **200** with `order.status = REJECTED` and `reject_reason` machine code. DTO/validation failures remain 400 without row.
- **Why:** Trade ticket UX + history; idempotent retries of a rejected client_order_id return the same reject.
- **Discuss before implement if:** Clients require RFC 7807 for all risk rejects.

---

## Suggested ticket breakdown

| Ticket | Estimate |
|--------|----------|
| Migrations + Prisma models + risk config | 0.5d |
| `getLatestClose` + unit tests | 0.5d |
| Risk service + tests | 0.75d |
| OrdersService fill/idempotency/transaction + tests | 1.5d |
| Controller DTO + e2e + smoke | 0.75d |
| Audit + docs + inventory | 0.5d |

**Total:** ~4.5 engineering days.

---

## Definition of done

- [ ] PR stacked on 4.1; migrations deploy cleanly
- [ ] #3.2.1–3.2.2, #3.3.1, #3.6.1–3.6.2 meet AC
- [ ] Market BUY/SELL updates cash, positions, executions correctly
- [ ] Risk limits enforced with documented defaults
- [ ] Idempotent `client_order_id` proven in unit + e2e
- [ ] Seed and MySQL paths both work
- [ ] build / lint / test / test:cov (≥90%) / test:e2e / verify script green
- [ ] Docs + manual testing updated
- [ ] Adopted defaults followed or any override recorded in the plan/PR

---

## References

- DDL: [docs/database/DDL/02_trading.sql](../database/DDL/02_trading.sql)
- API inventory §3: [API_Inventory.md](../database/API_Inventory.md)
- Migrations §4.2: [Migrations_Plan.md](../database/Migrations_Plan.md)
- Prior plan: [sprint-4-1-accounts-positions.md](./sprint-4-1-accounts-positions.md)
- Stories: [MVP_03](../product/stories/BitStockerz_MVP_03_Paper_Trading_Stories.md)
- NestJS ValidationPipe / DTOs: https://docs.nestjs.com/techniques/validation
- Prisma transactions: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Delivery: `.cursor/skills/sprint-delivery/SKILL.md`
