# Sprint 4.3 — Trading Views

**Status:** Plan ready  
**Roadmap marker:** Milestone 4 exit — “Users can simulate trades with correct P&amp;L”  
**Branch:** `feat/sprint-4-3-trading-views`  
**PR base:** `feat/sprint-4-2-orders-executions`

**Overview:** Ship read APIs for positions, portfolio summary, recent orders, and trade history. Consolidate domain `ErrorCode` values for trading (and stubs for strategies/backtests) per #8.3.2. No new tables — reads only over 4.1/4.2 data with seed/DB parity and mark-to-market using JC-1 close prices.

---

## Sprint scope and exit criteria

**Stories**

| ID | Title | Source |
|----|-------|--------|
| #3.4.1 | Current positions API | [MVP_03](../product/stories/BitStockerz_MVP_03_Paper_Trading_Stories.md) + [API_Inventory §3.2](../database/API_Inventory.md) |
| #3.4.2 | Portfolio summary | same §3.3 |
| #3.5.1 | Recent orders | same §3.1 GET |
| #3.5.2 | Trade history | same §3.2 GET executions |
| #8.3.2 | Domain error types for trading, strategies, backtests | [MVP_08](../product/stories/BitStockerz_MVP_08_Backend_Infrastructure_Stories.md) |

**Exit (ROADMAP):** Users can simulate trades with correct P&amp;L — place orders (4.2) and view positions, equity, orders, and executions with consistent unrealized P&amp;L.

**Explicitly out of scope**

| Item | Why deferred |
|------|----------------|
| New DDL / migrations | Migrations_Plan §4.3: APIs only |
| Order cancel / amend | Not in MVP |
| Realized P&amp;L ledger table | Derive later if needed; summary uses unrealized only per inventory |
| Strategy/backtest feature APIs | Codes only; implementation in Milestones 2–3 |
| Angular portfolio widgets | Milestone 5 |
| Account reset | JC-5 still deferred |

---

## Prerequisites

| Capability | Location | Relevance |
|------------|----------|-----------|
| Paper account, positions, cash | Sprint 4.1 | Portfolio inputs |
| Orders + executions + fills | Sprint 4.2 | History lists |
| `getLatestClose` / fill-price helper | 4.2 `FillPriceService` | MTM for position value + unrealized P&amp;L |
| AuthGuard | `auth.guard.ts` | All endpoints authenticated |
| `ErrorCode` + catalog + filter | `common/errors/*` | #8.3.2 expansion |
| Snake_case JSON convention | market-data / trading POST | Keep consistent |
| Coverage 90% | package.json | Controllers thin; service tests heavy |

---

## Draft acceptance criteria (lock before coding)

### #3.4.1 – Current positions API

- `GET /api/trading/positions` (AuthGuard).
- Returns **non-zero** positions for the caller’s paper account.
- Each row: `symbol`, `quantity`, `avg_cost` (strings for DECIMAL).
- Optional enrichment (not in inventory — **omit** unless Dev asks): `market_price`, `market_value`, `unrealized_pnl` — **default omit** to match inventory; MTM lives in portfolio summary (JC-13).
- Empty book → `[]`.
- Seed + MySQL parity.

### #3.4.2 – Portfolio summary

- `GET /api/trading/portfolio-summary` (AuthGuard).
- Response fields (inventory):
  - `cash_balance`
  - `total_position_value` — sum of `qty * latest_close` for open positions
  - `total_equity` — `cash_balance + total_position_value`
  - `unrealized_pnl_total` — sum of `(latest_close - avg_cost) * qty`
- If a held symbol has **no** market price: **fail closed** with `TRADING_NO_MARKET_PRICE` (JC-14) — do not silently treat as 0.
- DECIMAL string encoding consistent with JC-10.
- Unit tests: flat book, mixed winners/losers, missing price, empty positions (equity = cash).

### #3.5.1 – Recent orders

- `GET /api/trading/orders` (AuthGuard).
- Query: `status?`, `symbol?`, `limit?` (default **50**, max **200**).
- Newest first (`requested_at DESC`).
- Same order shape as POST response `order` object (list wrapper — JC-15).
- Includes `REJECTED` / `FILLED` (and any `CANCELLED` if introduced later).

### #3.5.2 – Trade history

- `GET /api/trading/executions` (AuthGuard).
- Query: `symbol?`, `limit?` (default **100**, max **500**).
- Newest first (`executed_at DESC`).
- Each item: `executed_at`, `symbol`, `side`, `quantity`, `price`, `notional` (`qty * price`).
- Only real fills (no reject rows).

### #8.3.2 – Domain error types

Expand `ErrorCode` + `ERROR_CATALOG`; exhaustive catalog unit test; migrate provisional 4.2 trading throws. Keep RFC 7807 filter shape. **No** strategy/backtest controllers — codes only.

| Domain | Codes (HTTP) |
|--------|----------------|
| Trading (wire now) | `TRADING_NO_MARKET_PRICE` (422), `TRADING_INSUFFICIENT_CASH` (422), `TRADING_INSUFFICIENT_POSITION` (422), `TRADING_RISK_LIMIT` (422), `TRADING_ACCOUNT_INACTIVE` (403), `TRADING_DUPLICATE_ORDER` (409, reserved) |
| Strategies (stub) | `STRATEGY_NOT_FOUND` (404), `STRATEGY_VALIDATION_ERROR` (400), `STRATEGY_FORBIDDEN` (403) |
| Backtests (stub) | `BACKTEST_NOT_FOUND` (404), `BACKTEST_VALIDATION_ERROR` (400), `BACKTEST_LIMIT_EXCEEDED` (422), `BACKTEST_FAILED` (500) |

---

## API contract

All routes: Auth required, snake_case, global prefix `/api`.

### `GET /api/trading/positions`

```json
{
  "positions": [
    {
      "symbol": "AAPL",
      "quantity": "10.50000000",
      "avg_cost": "198.45000000"
    }
  ]
}
```

### `GET /api/trading/portfolio-summary`

```json
{
  "cash_balance": "97916.27500000",
  "total_position_value": "2083.72500000",
  "total_equity": "100000.00000000",
  "unrealized_pnl_total": "0.00000000"
}
```

Notes: cash remains 2dp operationally but may serialize with scale; **prefer 2dp for cash, up to 8dp for crypto-influenced totals** (JC-16) — document chosen formatting helper.

### `GET /api/trading/orders?status=FILLED&limit=50`

```json
{
  "orders": [
    {
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
  ]
}
```

### `GET /api/trading/executions?limit=100`

```json
{
  "executions": [
    {
      "executed_at": "2026-07-25T15:10:00.000Z",
      "symbol": "AAPL",
      "side": "BUY",
      "quantity": "10.50000000",
      "price": "198.45000000",
      "notional": "2083.72500000"
    }
  ]
}
```

**Errors:** RFC 7807 via filter — e.g. `422` + `code: TRADING_NO_MARKET_PRICE` when MTM lacks a close.

**Seed mode:** in-memory maps + seed closes for MTM; MySQL uses indexed `orders`/`executions` queries. Empty new user → empty lists / equity = cash.

---

## Architecture

```mermaid
flowchart LR
  subgraph http [Trading read controllers]
    POSC[PositionsController]
    PORT[PortfolioController or TradingViewsController]
    ORDC[OrdersController GET]
    EXECC[ExecutionsController]
  end
  subgraph services [Services]
    VS[TradingViewsService]
    PA[PaperAccountsService]
    POS[PositionsService]
    OS[OrdersService]
    FP[FillPriceService]
  end
  subgraph errors [Error layer]
    EC[ErrorCode enum]
    CAT[ERROR_CATALOG]
    FILT[GlobalHttpExceptionFilter]
  end
  POSC --> VS
  PORT --> VS
  ORDC --> OS
  EXECC --> OS
  VS --> PA
  VS --> POS
  VS --> FP
  OS --> EC
  VS --> EC
  EC --> CAT --> FILT
```

**Concrete files**

| Path | Action |
|------|--------|
| `apps/api/src/trading/trading-views.service.ts` | Positions list + portfolio MTM |
| `apps/api/src/trading/trading-views.controller.ts` | GET positions + portfolio-summary |
| `apps/api/src/trading/orders.controller.ts` | Add GET list |
| `apps/api/src/trading/orders.service.ts` | `listOrders`, `listExecutions` |
| `apps/api/src/trading/dto/orders-query.dto.ts` | status/symbol/limit |
| `apps/api/src/trading/dto/executions-query.dto.ts` | symbol/limit |
| `apps/api/src/common/errors/error-codes.enum.ts` | Add TRADING_/STRATEGY_/BACKTEST_ |
| `apps/api/src/common/errors/error-catalog.ts` | Catalog entries + typeSuffixes |
| `apps/api/src/common/errors/*.spec.ts` | Exhaustive catalog test |
| `apps/api/src/trading/*.spec.ts` | MTM / list filters |
| `apps/api/test/app.e2e-spec.ts` | Full paper loop: register → buy → views |
| `scripts/smoke-test-api.sh` | Authenticated portfolio smoke |
| `docs/manual-testing/manual_testing.md` | Milestone 4 section |

No Prisma migrations.

---

## Implementation plan (ordered)

### 1. Error catalog (#8.3.2)

1. Add enum members + catalog entries + `typeSuffix` URIs.
2. Spec: `Object.values(ErrorCode)` every key present in catalog; sample DomainError → filter status.
3. Refactor 4.2 throw sites to final trading codes (keep JC-12 REJECTED body behavior — those paths may not throw).

### 2. List queries (#3.5.1 / #3.5.2)

1. `listOrders` / `listExecutions` with filters + limit clamp.
2. Join/lookup symbol ticker for response.
3. Unit + e2e.

### 3. Positions + portfolio (#3.4.1 / #3.4.2)

1. Non-zero positions query.
2. Portfolio MTM using FillPriceService (JC-1); fail closed (JC-14).
3. Formatting helper for DECIMAL strings (JC-16).
4. Unit tests with mocked prices.

### 4. Controllers + module wiring

1. Thin controllers; AuthGuard; ValidationPipe query DTOs.
2. Metrics interceptor route group: add `trading` label if not present.

### 5. E2E paper loop + docs + gates

E2E (seed): register → buy → positions/summary/orders/executions → idempotent replay. MySQL: `KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify`.

Docs: inventory §3 GETs implemented; ROADMAP Milestone 4 complete + `START HERE` → 5.1; MVP_03/MVP_08 AC; manual testing section; CHANGELOG/README/reference branch map.

Gates: `build` / `lint` / `test` / `test:cov` / `test:e2e` / `sprint-delivery-verify.sh verify`.

---

## Best-practice checklist

- [ ] Read APIs are side-effect free (except documented lazy paper-account heal from 4.1)
- [ ] Indexed order/execution queries — use existing DDL indexes
- [ ] MTM uses same close source as fills (JC-1) — no divergent price logic
- [ ] Fail closed on missing MTM price (JC-14)
- [ ] Exhaustive `ErrorCode` ↔ catalog test
- [ ] RFC 7807 unchanged shape ([Sprint 8.3.1 filter](../../apps/api/src/common/errors/http-exception.filter.ts))
- [ ] Snake_case list wrappers consistent (`positions` / `orders` / `executions`)
- [ ] AuthGuard on all trading GETs
- [ ] Coverage ≥90%; e2e covers full paper loop
- [ ] ROADMAP Milestone 4 exit criteria satisfied
- [ ] Conventional Commits; PR onto 4.2 branch

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| MTM N+1 price lookups | Batch latest closes by symbol ids |
| Unrealized P&amp;L confusion vs realized | Document inventory fields only; no realized field yet |
| Error code rename breaks 4.2 clients | Stabilize names in this sprint; changelog note |
| Strategy/backtest codes unused | Stub-only; prevent “dead code” lint via catalog test reference |
| Decimal formatting inconsistency | One `formatDecimal(value, scale)` helper |
| Portfolio endpoint slow with many positions | MVP single account + tiny universe; still batch |

---

## Dev input required

| # | Blocker | Why | Default | Status |
|---|---------|-----|---------|--------|
| 1 | Per-position MTM fields on GET positions | Inventory omits them | ⏭ Omit; summary only | ⏭ |
| 2 | Missing price → 422 vs zero value | Honesty vs demo resilience | ⏭ 422 fail closed | ⏭ |
| 3 | List response wrapper keys | Bare array vs `{ orders: [] }` | ⏭ Wrapped objects | ⏭ |
| 4 | Cash decimal places in summary | Cosmetics | ⏭ cash 2dp; others up to 8 | ⏭ |
| 5 | `TRADING_DUPLICATE_ORDER` vs silent idempotent 200 | 4.2 chose 200 replay | ⏭ Keep 200; code unused or reserved | ⏭ |

---

## Judgement calls

### JC-1 — Fill / MTM price (reaffirm)
- **Decision:** Portfolio MTM uses the **same** `getLatestClose` rules as order fills (equity daily / crypto daily / hourly fallback).
- **Why:** P&amp;L must match trade economics; one price authority.
- **Discuss before implement if:** UI wants “last trade price” distinct from daily close.

### JC-13 — Positions payload richness
- **Decision:** Stick to inventory `{ symbol, quantity, avg_cost }` only.
- **Why:** Avoid scope creep; summary carries aggregate MTM.
- **Discuss before implement if:** Dashboard (Milestone 5) needs per-line P&amp;L without a second call.

### JC-14 — Missing MTM price
- **Decision:** `GET /portfolio-summary` returns **422** `TRADING_NO_MARKET_PRICE` if any open position lacks a close.
- **Why:** Better than lying with zeros; seed fixtures always have closes for traded symbols.
- **Discuss before implement if:** Prefer partial valuation with `degraded` flag (would expand contract).

### JC-15 — List wrappers
- **Decision:** Wrap arrays: `{ orders: [...] }`, `{ executions: [...] }`, `{ positions: [...] }`.
- **Why:** Extensible for `next_cursor` later; consistent with other APIs that use objects.
- **Discuss before implement if:** Inventory’s “list of orders” must be a raw JSON array.

### JC-16 — Decimal formatting
- **Decision:** `cash_balance` → 2 decimal places; qty/price/position values → up to 8, trim trailing zeros optional but stable tests should fix scale.
- **Why:** Cash is USD cents; crypto qty needs finer scale.
- **Discuss before implement if:** All-string 8dp everywhere is simpler for clients.

### JC-17 — #8.3.2 stub breadth
- **Decision:** Add STRATEGY_* and BACKTEST_* codes now even without callers.
- **Why:** Story explicitly names all three domains; prevents ad-hoc strings later.
- **Discuss before implement if:** Prefer adding codes only when first thrown (YANGI).

---

## Suggested ticket breakdown

| Ticket | Estimate |
|--------|----------|
| ErrorCode + catalog + migrate 4.2 sites + tests | 0.75d |
| GET orders + executions + DTOs + tests | 0.75d |
| GET positions + portfolio MTM + tests | 1.0d |
| E2E full paper loop + smoke | 0.5d |
| Docs / ROADMAP Milestone 4 exit / manual section | 0.5d |

**Total:** ~3.5 engineering days.

---

## Definition of done

- [ ] PR stacked on 4.2; **no** new migrations
- [ ] #3.4.1–3.4.2, #3.5.1–3.5.2, #8.3.2 meet AC
- [ ] Portfolio MTM = positions × JC-1 closes + cash; fail closed on missing price
- [ ] Exhaustive error catalog; e2e paper loop green; cov ≥90%
- [ ] Inventory §3 + ROADMAP Milestone 4 done; `START HERE` → 5.1; manual section updated
- [ ] JC defaults followed or overridden in Dev input

---

## References

- API inventory §3: [API_Inventory.md](../database/API_Inventory.md)
- Migrations §4.3 (no DDL): [Migrations_Plan.md](../database/Migrations_Plan.md)
- Prior plans: [sprint-4-1-accounts-positions.md](./sprint-4-1-accounts-positions.md), [sprint-4-2-orders-executions.md](./sprint-4-2-orders-executions.md)
- Stories: [MVP_03](../product/stories/BitStockerz_MVP_03_Paper_Trading_Stories.md), [MVP_08](../product/stories/BitStockerz_MVP_08_Backend_Infrastructure_Stories.md)
- Roadmap Milestone 4 exit: [ROADMAP.md](../product/ROADMAP.md)
- RFC 7807 filter: `apps/api/src/common/errors/http-exception.filter.ts`
- NestJS pipes (query DTOs): https://docs.nestjs.com/techniques/validation
- Delivery: `.cursor/skills/sprint-delivery/SKILL.md`
