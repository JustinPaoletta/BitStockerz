# Sprint 3.4 — Backtest UI

**Status:** Plan ready (not started)  
**Roadmap marker:** Milestone 3 / Sprint 3.4 (ROADMAP exit: Strategy → Backtest → Results fully demoable)  
**Branch:** `feat/sprint-3-4-backtest-ui`  
**PR base:** `feat/sprint-3-3-backtest-execution-limits`

**Overview:** Deliver the backtest results visualization surface — equity curve chart and trades table — against the Sprint 3.3 APIs. Because ROADMAP places Angular shell scaffolding in Sprint 5.1 (`apps/web`), this sprint **soft-depends** on extracting a minimal Angular application shell early (prerequisite slice of 5.1). If that shell is not pulled forward, ship API-ready OpenAPI examples + manual-test fixtures and park UI components until 5.1 — but the recommended path is a thin `apps/web` scaffold so Milestone 3 exit stays demoable.

---

## Sprint scope and exit criteria

**Stories**

| ID | Title | Source |
|----|-------|--------|
| #5.4.1 | Equity curve chart | [MVP_05](../product/stories/BitStockerz_MVP_05_Backtesting_Stories.md) + [UX_Flows](../product/UX_Flows.md) |
| #5.4.2 | Trades table | same |

**Exit (from [ROADMAP.md](../product/ROADMAP.md)):** Strategy → Backtest → Results fully demoable in the Angular app (recommended path), consuming `GET /api/backtests/:id`.

**Explicitly out of scope**

| Item | Why deferred |
|------|----------------|
| Full dashboard widgets (#7.x) | Milestone 5 |
| Strategy builder UI polish | Milestone 2/5 boundaries |
| AI explain-backtest panel | Sprint 6.3 |
| Chart entry/exit markers v2 beyond MVP | Nice-to-have; markers optional if cheap (JC-4) |
| React / Chart.js | Angular + TradingView Lightweight Charts only |
| Schema / API changes | No migrations; use 3.3 contracts |
| Paper trading screens | Milestone 4 |

---

## Prerequisites (what already shipped)

| Capability | Location | Relevance to 3.4 |
|------------|----------|------------------|
| `GET /api/backtests/:id` with `equity_curve` + `trades` | Sprint 3.3 | Sole data source for UI |
| `POST /api/backtests` + list | Sprint 3.3 | Run + navigate to detail |
| Auth session bearer | API AuthGuard | Web must attach token |
| Strategy CRUD APIs | Milestone 2 | Pre-filled run form needs `strategy_id` |
| Market data symbols | Sprint 1.x | Symbol picker / validation |
| UX flow “Strategy → Backtest” | [UX_Flows.md](../product/UX_Flows.md) | Navigation expectations |
| Angular target | ROADMAP Milestone 5 note | Frontend is Angular, not React |

**Schema:** No changes ([Migrations_Plan — Sprint 3.4](../database/Migrations_Plan.md)).

**Soft prerequisite (JC-1):** Minimal `apps/web` Angular scaffold (routing, env API base URL, auth interceptor, layout shell) extracted from Sprint 5.1 — see [sprint-5-1-shell-navigation.md](./sprint-5-1-shell-navigation.md); 3.4 takes only the thin slice needed for backtest routes, then 5.1 extends shell/nav/dashboard.

---

## Draft acceptance criteria (lock before coding)

### Prerequisite slice – Minimal Angular shell (from 5.1)

Ship **only** what charts need (do not implement full Milestone 5 dashboard):

- `apps/web` Angular app (current stable Angular via `ng new` / workspace convention matching monorepo — JC-2).
- Environments: `apiBaseUrl` → `http://localhost:4000/api`.
- Auth: store session token from existing auth endpoints; `Authorization` interceptor; login route good enough for demos (reuse API dev register/login).
- Router outlets: `/login`, `/backtests`, `/backtests/:id` (and stub `/strategies` link if needed to pick an id).
- Shared `ApiClient` / `BacktestsApi` service returning typed snake_case models.
- README: `pnpm/npm start` for web on a non-4000 port (e.g. 4200) + CORS note for API (JC-3).

If product **rejects** pulling shell forward: mark #5.4.1/#5.4.2 blocked; deliver § “API-ready fixtures” below and move UI stories to post-5.1 — document on ROADMAP (not the recommended default).

### #5.4.1 – Equity curve chart

- Detail page loads `GET /api/backtests/:id` and renders `equity_curve` as a time-series chart using **TradingView Lightweight Charts** ([library](https://www.tradingview.com/lightweight-charts/)).
- Chart shows equity vs time; empty/failed run states show an inline message (no chart crash).
- Loading and error (404/401) states are handled.
- Responsive: readable on desktop and mobile width (chart container `width: 100%`, resize handler).
- Summary metrics row above chart: total return, max drawdown, win rate, trade count, optional Sharpe (from `results`).
- Unit/component test: component maps API points → chart series data (pure mapper tested without canvas where possible).

### #5.4.2 – Trades table

- Below the chart, a table of `trades[]` columns: entry time, exit time, side, entry price, exit price, quantity, pnl abs, pnl %.
- Sort default: `entry_time` ascending (API order).
- PnL styling: distinct positive/negative classes (no emoji).
- Empty trades → “No trades” message.
- If API returns paginated trades (3.3 soft cap), table shows “Load more” calling `trades_offset` (JC-5).
- Accessibility: real `<table>` (or Angular CDK table) with column headers.

### Cross-cutting demo path

- From a backtest list page (minimal): show recent runs → navigate to detail.
- Optional thin “Run backtest” form: strategy id, symbol, timeframe, dates, initial equity → POST → navigate to detail (unblocks ROADMAP exit without waiting for full Strategy Lab UI).
- Manual testing script documents the click-path.

### API-ready fixtures (always ship)

Even with UI, add under `docs/manual-testing/fixtures/backtest-detail.example.json` (or `apps/web/public/fixtures/`) a frozen example of `GET /backtests/:id` response for offline UI work and contract tests.

---

## API contract (canonical)

**No new HTTP routes.** Consume Sprint 3.3:

| Method | Path | UI usage |
|--------|------|----------|
| `POST` | `/api/backtests` | Optional run form |
| `GET` | `/api/backtests` | List page |
| `GET` | `/api/backtests/:id` | Detail chart + table |

Contract stability requirements for UI:

- `equity_curve[].timestamp` ISO-8601 UTC; `equity` number
- `trades[]` field names snake_case as inventory
- `results` null when `status !== completed`

If any rename is required, fix in 3.3 follow-up **before** UI merge — do not fork field names in the client.

OpenAPI (optional stretch): annotate Nest controllers with `@nestjs/swagger` only if already chosen elsewhere; otherwise keep inventory + example JSON as source of truth (JC-6).

---

## Architecture

```mermaid
flowchart TB
  subgraph web [apps/web Angular]
    Login[LoginComponent]
    List[BacktestListComponent]
    Detail[BacktestDetailComponent]
    Chart[EquityCurveChartComponent]
    Table[TradesTableComponent]
    API[BacktestsApi service]
    AuthInt[AuthInterceptor]
  end

  subgraph api [apps/api]
    BT[BacktestsController]
  end

  Login --> AuthInt
  List --> API
  Detail --> API
  Detail --> Chart
  Detail --> Table
  API --> AuthInt
  AuthInt --> BT
```

### Module / file layout (recommended)

| Path | Role |
|------|------|
| `apps/web/` | Angular workspace app (scaffold) |
| `apps/web/src/app/core/api-base.config.ts` | API base URL |
| `apps/web/src/app/core/auth/` | Token storage + interceptor + login |
| `apps/web/src/app/features/backtests/backtests.routes.ts` | Feature routes |
| `apps/web/src/app/features/backtests/backtests-api.service.ts` | HTTP client |
| `apps/web/src/app/features/backtests/pages/backtest-list.page.ts` | List |
| `apps/web/src/app/features/backtests/pages/backtest-detail.page.ts` | Detail shell + metrics |
| `apps/web/src/app/features/backtests/components/equity-curve-chart.component.ts` | Lightweight Charts wrapper |
| `apps/web/src/app/features/backtests/components/trades-table.component.ts` | Table |
| `apps/web/src/app/features/backtests/models/backtest.models.ts` | TS interfaces matching API |
| `docs/manual-testing/fixtures/backtest-detail.example.json` | Frozen contract |
| `apps/api` CORS config | Allow web origin in dev (if not already) |

**Design principles**

1. **Feature module isolation** — backtests UI does not require full dashboard widgets.
2. **Presentational chart/table** — inputs are plain arrays; page owns fetching.
3. **Finance-native chart** — Lightweight Charts over Chart.js/generic charts.
4. **No cards-for-decoration** — follow existing product simplicity; one detail composition.

---

## Implementation plan (ordered)

### 1. Decision gate (day 0)

1. Confirm JC-1: pull minimal Angular shell into this sprint (recommended **yes**).
2. If no: stop UI implementation; ship fixtures + ROADMAP note; re-open #5.4.x after 5.1.
3. If yes: create scaffold branch slice first (can be same PR or stacked `chore/apps-web-shell` merged into 3.4).

### 2. Scaffold `apps/web` (prerequisite)

1. Generate Angular app under `apps/web`.
2. Add proxy or CORS for `localhost:4000`.
3. Auth login using existing `POST /api/auth/login` (dev) or WebAuthn if already UX-ready — **default dev login** for speed (JC-7).
4. Smoke: logged-in call to `GET /api/health/live`.

### 3. Backtests API client + fixtures

1. Type models from 3.3 response.
2. Commit example JSON fixture.
3. List + detail services with error mapping.

### 4. Equity curve (#5.4.1)

1. Add dependency `lightweight-charts`.
2. Wrapper component: create chart on init, `setData` from mapped `{ time, value }`, cleanup on destroy.
3. Metrics summary header.
4. Handle failed runs (`results === null`).

### 5. Trades table (#5.4.2)

1. Table component with formatting (dates locale-aware, numbers fixed decimals).
2. Wire into detail page below chart.
3. Load-more if pagination present.

### 6. Minimal list + run form (demo glue)

1. List recent backtests.
2. Simple reactive form → POST → navigate to `:id`.
3. Manual testing section with screenshots optional.

### 7. Quality gates

```bash
# API still green
npm --prefix apps/api run test:cov

# Web
npm --prefix apps/web run build
npm --prefix apps/web run test   # if configured
npm --prefix apps/web run lint
```

| File | Update |
|------|--------|
| `docs/product/ROADMAP.md` | Mark 3.4; note shell pulled from 5.1 or deferred |
| `docs/product/stories/BitStockerz_MVP_05_*.md` | AC + completion |
| `docs/product/UX_Flows.md` | Confirm demo path |
| `docs/manual-testing/manual_testing.md` | UI section |
| Root `README.md` | How to run API + web |
| Sprint 5.1 plan/stories later | Deduplicate shell work already done |
| `CHANGELOG.md`, branch map | |

---

## Best-practice checklist

- [ ] Soft-dep on minimal Angular shell decided and documented (JC-1)
- [ ] TradingView Lightweight Charts for equity ([docs](https://www.tradingview.com/lightweight-charts/))
- [ ] No Chart.js / no React
- [ ] Auth token on all backtest API calls
- [ ] Pure mappers unit-tested (timestamp → chart time)
- [ ] Failed/empty states without console errors
- [ ] CORS/proxy documented for local demo
- [ ] Contract fixture checked in
- [ ] Conventional Commits (`feat: add backtest equity chart and trades table`)
- [ ] ROADMAP 5.1 shell stories adjusted to avoid double scaffold

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| ROADMAP orders UI before Angular scaffold | JC-1 pull-forward shell; else explicit defer |
| CORS blocks browser calls | Dev CORS allowlist or Angular proxy.conf |
| Lightweight Charts time scale vs ISO strings | Normalize to UTCSeconds / `YYYY-MM-DD` for daily |
| Large equity arrays stall UI | Already capped by bar limits; virtualize table if needed |
| Auth story incomplete for web | Dev login shortcut for Milestone 3 demo |
| Duplicating 5.1 work | Track shell completion; 5.1 starts from existing `apps/web` |

---

## Dev input required

| # | Blocker | Why it blocks | Default if unanswered | Status |
|---|---------|---------------|----------------------|--------|
| 1 | Pull Angular shell into 3.4? | apps/web missing until 5.1 | ⏭ **Yes** — minimal shell prerequisite | ⏭ stubbed |
| 2 | Package manager for web | npm vs pnpm monorepo | ⏭ Match `apps/api` npm scripts style unless root pnpm exists | ⏭ stubbed |
| 3 | CORS vs proxy | Local DX | ⏭ Angular `proxy.conf.json` to `:4000` | ⏭ stubbed |
| 4 | Entry/exit markers on chart | Scope | ⏭ Optional if &lt; 0.5d; else skip | ⏭ stubbed |
| 5 | Dev login vs WebAuthn-only | Demo friction | ⏭ Dev email/password login for UI sprint | ⏭ stubbed |
| 6 | OpenAPI generation | Extra deps | ⏭ Example JSON + inventory only | ⏭ stubbed |

---

## Judgement calls

### JC-1 — Soft-depend on early Angular shell (REQUIRED)

**Decision:** Sprint 3.4 **pulls forward** a minimal `apps/web` scaffold (prerequisite slice of Sprint 5.1) so #5.4.1/#5.4.2 can ship real UI. Sprint 5.1 then extends shell/nav/dashboard rather than greenfield scaffolding.  
**Why:** ROADMAP Milestone 3 exit requires a demoable Strategy → Backtest → Results path; waiting until 5.1 breaks that exit.  
**Discuss before implement if:** Team wants Milestone 3 to be API-only and will move #5.4.x after 5.1 on ROADMAP (acceptable fallback — update stories/ROADMAP explicitly).

### JC-2 — Angular standalone + modern defaults

**Decision:** Scaffold with current Angular standalone components / application builder; no NgModules unless team standard says otherwise.  
**Why:** Matches modern Angular defaults; less boilerplate for a thin feature.  
**Discuss before implement if:** Existing internal template mandates NgModule structure.

### JC-3 — Dev proxy over API CORS expansion

**Decision:** Prefer `apps/web/proxy.conf.json` forwarding `/api` → `http://localhost:4000`; only add Nest CORS if proxy is insufficient for e2e tooling.  
**Why:** Avoid widening API CORS in production accidentally.  
**Discuss before implement if:** Preview deployments need cross-origin API early.

### JC-4 — Chart library = Lightweight Charts; markers optional

**Decision:** Use TradingView Lightweight Charts for the equity series. Entry/exit markers are **optional** stretch if trade times map cleanly; not required for DoD.  
**Why:** Finance-native performance/UX; markers are polish.  
**Discuss before implement if:** Design requires candles+overlays in MVP (out of scope — equity only).

### JC-5 — Honor 3.3 trade pagination

**Decision:** Implement “Load more” when `trades.length` equals requested limit or API provides a `has_more` flag (add flag in 3.3 if missing — small follow-up).  
**Why:** Prevents silent truncation.  
**Discuss before implement if:** Product guarantees trades always &lt; 1000 for MVP demos.

### JC-6 — No Swagger requirement

**Decision:** Do not block 3.4 on `@nestjs/swagger`; use inventory + checked-in fixture JSON.  
**Why:** Inventory is already canonical; Swagger is orthogonal.  
**Discuss before implement if:** Client generation is mandated org-wide.

### JC-7 — Dev login for Milestone 3 demo

**Decision:** Web login page calls existing dev `POST /api/auth/login` (or register+login). WebAuthn-only UX can wait for Milestone 5 polish.  
**Why:** Unblocks demo without passkey hardware in every environment.  
**Discuss before implement if:** Dev auth endpoints are disabled in the target demo env.

### JC-8 — Scope of “run form”

**Decision:** Include a **minimal** run form on `/backtests` (ids + dates) sufficient for demo; do not build full Strategy Lab UI.  
**Why:** ROADMAP exit needs an operable path without Milestone 5 strategy screens.  
**Discuss before implement if:** Strategy Lab UI already provides “Run backtest” navigation by then — then skip duplicate form.

---

## Suggested ticket breakdown

| Ticket | Estimate |
|--------|----------|
| Decision gate + ROADMAP note | 0.1d |
| Angular shell scaffold + auth + proxy | 1.0–1.5d |
| Backtests API client + fixture JSON | 0.5d |
| Equity curve component + metrics | 1.0d |
| Trades table + pagination UX | 0.75d |
| List + minimal run form + manual docs | 0.75d |

**Total:** ~4–5 engineering days (shell-heavy); ~2 days if shell already exists.

---

## Definition of done

- [ ] JC-1 resolved (shell pulled **or** UI explicitly deferred with ROADMAP edit)
- [ ] #5.4.1 and #5.4.2 implemented per AC **or** formally rescheduled
- [ ] No DB migrations
- [ ] Demo path: login → run/list → detail with chart + table
- [ ] `apps/web` build passes; API tests still green
- [ ] Manual testing section + fixture JSON committed
- [ ] Sprint 5.1 shell work de-duplicated in docs
- [ ] PR opened against Sprint 3.3 base

---

## References

- TradingView Lightweight Charts: https://www.tradingview.com/lightweight-charts/  
- Lightweight Charts docs / npm: https://tradingview.github.io/lightweight-charts/  
- Angular HTTP client: https://angular.dev/guide/http  
- Angular router: https://angular.dev/guide/routing  
- API inventory §5: [docs/database/API_Inventory.md](../database/API_Inventory.md)  
- UX flows: [docs/product/UX_Flows.md](../product/UX_Flows.md)  
- ROADMAP Milestone 5 shell note: [docs/product/ROADMAP.md](../product/ROADMAP.md)  
- Prior plans: [sprint-3-3-backtest-execution-limits.md](./sprint-3-3-backtest-execution-limits.md)  
- Delivery workflow: `.cursor/skills/sprint-delivery/SKILL.md`
