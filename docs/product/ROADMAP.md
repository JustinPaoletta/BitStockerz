# BitStockerz – Implementation Roadmap (Sprint → Story Mapping)

This roadmap maps **every sprint to concrete story IDs** from the MVP documents (#1–#8).
It is explicit enough to drop directly into Jira / Linear / GitHub Projects.

Assumptions:
- 1–2 week sprints
- Small team (1–3 engineers)
- Stories referenced exactly as numbered in the MVP docs
- Frontend implementation target is Angular for all UI/application work; no React frontend is planned

## Current delivery state — August 2, 2026

| Scope | State | Evidence / next action |
| --- | --- | --- |
| Milestones 0–1 | Backend/platform scope completed | Platform, auth APIs, market data, ingestion/jobs, and observability are implemented and verified. Full passkey/OAuth/profile browser UI has not shipped. |
| Sprints 2.1–3.4 | Completed and merged in PR #9 | Strategy Lab, deterministic resource-bounded engine, transactional persistence, authenticated backtest APIs, and the thin Angular results app. |
| Sprints 4.1–4.3 | Completed and merged in PR #10 | Paper-account provisioning, atomic market fills, positions/cash, risk and idempotency, order/execution history, and portfolio MTM are verified in seed and MySQL modes. |
| Sprint 5.1 | Completed on `feat/sprint-5-dashboard-workflows` | Authenticated shell, dark brand, passkey UI, dashboard route, symbol search. |
| Sprints 5.2–5.3 | Completed on `feat/sprint-5-dashboard-workflows` | Dashboard widgets + Strategy Lab / Trade workflows in the same PR. |
| Sprints 6.1–7.2 | Plans ready; not started | Follow the linked implementation contract and predecessor dependency. External provisioning is only required where the plan says so. |

The canonical readiness index is [docs/plans/README.md](../plans/README.md). “Ready” means the implementation contract has adopted defaults and can be developed when its predecessor is available; it does not mean the sprint has shipped.

---

## Milestone 0 – Platform Foundation

### Sprint 0.1 – Core Infra Baseline

**Stories**
- #8.3.1 – Standardized API error response format
- #8.4.1 – Structured logging & correlation IDs
- #8.5.1 – Central configuration service
- #8.6.2 – Health & readiness endpoints
- Status: Completed (verified February 19, 2026; covered by e2e suite as of July 3, 2026) for #8.3.1, #8.4.1, #8.5.1, and #8.6.2

---

### Sprint 0.2 – Authentication & Profile MVP

**Stories**
- #1.1.1 – User can create an account with a passkey
- #1.1.2 – User can sign in with a passkey
- #1.1.3 – User can connect/sign in with Google OAuth
- #1.1.4 – User can connect/sign in with Apple OAuth
- #1.1.5 – User can manage sessions (logout / token expiry)
- #1.1.6 – Account recovery & lost-device path
- #1.2.1 – User can view basic profile
- #1.2.2 – User can update display preferences
- #1.4.1 – Rate limit auth endpoints
- Status: Backend/API implementation completed (verified July 3, 2026).
  The current Angular app still uses development email shortcuts until Sprint
  5.1, which owns session-shell hardening and **required** passkey
  register/login UI (#1.1.1–#1.1.2). Google/Apple OAuth browser polish and
  deployed redirect hosting remain Sprint 7.2. Profile recovery UX beyond
  passkey primary flows stays follow-up frontend work.
- Follow-up: #1.3.1 shipped in Sprint 4.1 so every successful new-user signup path provisions one paper account.

**Exit**
- Authenticated API requests
- Core auth, session, and profile API loops are functional

---

## Milestone 1 – Market Data Core

### Sprint 1.1 – Symbols & Schemas

**Stories**
- #2.1.1 – Equity symbol directory
- #2.1.2 – Crypto symbol directory
- #2.1.3 – Symbol lookup API
- #2.2.1 – Equity daily OHLCV schema
- #2.3.1 – Crypto daily/hourly OHLCV schema
- #2.4.1 – Symbol search API
- Status: Completed (verified July 3, 2026)

---

### Sprint 1.2 – Market Data Read APIs

**Stories**
- #2.2.3 – Equity daily candles API
- #2.3.3 – Crypto candles API
- Status: Completed (verified July 10, 2026)

**Exit**
- Candles retrievable for stocks and crypto

---

### Sprint 1.3 – Data Ingestion & Jobs

**Stories**
- #2.2.2 – Equity history import
- #2.3.2 – Crypto import & incremental updates
- #8.1.1 – Job model & lifecycle
- #8.1.2 – Synchronous executor
- #8.1.3 – Job timeout handling
- #8.6.1 – Scheduled jobs
- Status: Completed (verified July 11, 2026)
- Follow-up (July 19, 2026): local-dev hardening — MySQL Docker workflow, API `.env` auto-load, auth user-id remapping that preserves MySQL jobs, e2e seed-mode setup, and smoke/verify script env helpers. Not Sprint 1.4 scope.

**Exit**
- Market data ingestion runnable on a schedule
- Jobs infrastructure usable by backtesting and other domains

---

### Sprint 1.4 – Data Health & Observability

**Stories**
- #2.6.1 – Market data sanity checks
- #2.6.2 – Market data health endpoint
- #8.4.2 – Performance metrics
- #8.4.3 – Audit logging
- Status: Completed (verified July 24, 2026)

**Exit**
- Market data pipelines are observable and verifiable

---

## Milestone 2 – Strategy Lab Core

### Sprint 2.1 – Strategy Persistence & Versioning

**Implementation plan:** [docs/plans/sprint-2-1-strategy-persistence-versioning.md](../plans/sprint-2-1-strategy-persistence-versioning.md) · [all sprint plans](../plans/README.md)

**Stories**
- #4.1.1 – Strategy schema
- #4.1.2 – Strategy versioning
- Status: Implementation complete locally (verified in seed and MySQL modes July 26, 2026); included in draft PR #9

**Exit**
- Authenticated strategy creation persists metadata and immutable version 1
- Owner-scoped strategy reads return the latest definition without leaking other users' records

---

### Sprint 2.2 – Indicators & Rule Schema

**Implementation plan:** [docs/plans/sprint-2-2-indicators-rule-schema.md](../plans/sprint-2-2-indicators-rule-schema.md) · [all sprint plans](../plans/README.md)

**Stories**
- #4.2.1 – Indicator catalog
- #4.3.1 – Condition schema
- #4.3.2 – Entry rules (AND-only)
- #4.3.3 – Exit rules (AND-only)
- #4.4.1 – Stop loss configuration
- #4.4.2 – Take profit configuration
- Status: Implementation complete locally (verified July 27, 2026); stacked with Sprint 2.1 in draft PR #9

---

### Sprint 2.3 – Strategy CRUD & Validation

**Implementation plan:** [docs/plans/sprint-2-3-strategy-crud-validation.md](../plans/sprint-2-3-strategy-crud-validation.md)

**Stories**
- #4.5.1 – Create strategy
- #4.5.2 – Update strategy
- #4.5.3 – List strategies
- #4.5.4 – Get strategy details
- #4.5.5 – Delete strategy
- #4.6.1 – Strategy validation endpoint
- #4.6.2 – Human-readable strategy summary
- Status: Implementation complete locally (verified July 28, 2026); stacked with Sprints 2.1–2.2 in draft PR #9

**Exit**
- Users can create and manage valid strategies

---

## Milestone 3 – Backtesting Engine (Critical Path)

### Sprint 3.1 – Backtest Engine Core

**Implementation plan:** [docs/plans/sprint-3-1-backtest-engine-core.md](../plans/sprint-3-1-backtest-engine-core.md)

**Stories**
- #5.2.1 – Engine interface
- #5.2.2 – Indicator computation layer
- #5.2.3 – Rule evaluation
- #5.2.4 – Trade simulation logic
- #5.2.5 – Stop loss / take profit handling
- #8.2.1 – Execution sandbox boundaries
- #8.2.2 – Runtime & memory limits per backtest
- Status: Implementation complete locally (verified July 28, 2026); stacked with Sprints 2.1–2.3 in draft PR #9

**Exit**
- Deterministic in-memory engine returns closed trades, one equity point per
  bar, summary metrics, and bounded diagnostics without DB or HTTP.

---

### Sprint 3.2 – Backtest Persistence

**Implementation plan:** [docs/plans/sprint-3-2-backtest-persistence.md](../plans/sprint-3-2-backtest-persistence.md)

**Stories**
- #5.1.1 – Backtest run schema
- #5.1.2 – Backtest result storage
- #5.1.3 – Trades & equity curve storage
- #5.6.1 – Strategy version pinning
- Status: Implementation complete locally (verified in seed and MySQL modes
  July 28, 2026); stacked with Sprints 2.1–3.1 in draft PR #9

**Exit**
- Runs pin immutable owned strategy versions and persist deterministic results,
  trades, and equity points transactionally in MySQL with copy-on-write
  in-memory parity, compatible symbol/timeframe validation, and summary metrics
  derived from the fixed-scale detail rows.

---

### Sprint 3.3 – Backtest Execution & Limits

**Implementation plan:** [docs/plans/sprint-3-3-backtest-execution-limits.md](../plans/sprint-3-3-backtest-execution-limits.md)

**Stories**
- #5.3.1 – Run backtest API
- #5.3.2 – List backtest runs
- #5.3.3 – Backtest details API
- #5.5.1 – Bar count limits
- #5.5.2 – Logging & diagnostics
- Status: Implementation complete locally (verified July 28, 2026); stacked
  with Sprints 2.1–3.2 in draft PR #9

**Exit**
- Authenticated users can synchronously run a backtest through the jobs
  executor, list owned runs, and read paged trades plus the complete equity
  curve.
- Bar/series/time limits, POST-only per-user rate limits, stable RFC 7807
  failures, bounded diagnostics, metrics, logs, and audit metadata are enforced.

---

### Sprint 3.4 – Backtest UI

**Implementation plan:** [docs/plans/sprint-3-4-backtest-ui.md](../plans/sprint-3-4-backtest-ui.md)

**Stories**
- #5.4.1 – Equity curve chart
- #5.4.2 – Trades table
- Status: Implementation complete locally (verified with build, lint, unit,
  API regression, desktop browser, and 390px mobile browser checks August 1,
  2026); stacked with Sprints 2.1–3.3 in draft PR #9
- Note: Sprint 3.4 owns the thin Angular 21.2.19 scaffold compatible with the
  repository's pinned Node 24.11.1. Sprint 5.1 extends it rather than
  re-scaffolding.

**Exit**
- Strategy → Backtest → Results fully demoable

---

## Milestone 4 – Paper Trading

### Sprint 4.1 – Accounts & Positions

**Status: Completed (verified August 2, 2026)**

**Implementation plan:** [docs/plans/sprint-4-1-accounts-positions.md](../plans/sprint-4-1-accounts-positions.md)

**Stories**
- #1.3.1 – Default paper account creation on first signup
- #3.1.1 – Paper trading account
- #3.3.2 – Positions table & logic
- #3.3.3 – Cash balance updates

---

### Sprint 4.2 – Orders & Executions

**Status: Completed (verified August 2, 2026)**

**Implementation plan:** [docs/plans/sprint-4-2-orders-executions.md](../plans/sprint-4-2-orders-executions.md)

**Stories**
- #3.2.1 – Order schema
- #3.2.2 – Place market order
- #3.3.1 – Execution records
- #3.6.1 – Risk limits
- #3.6.2 – Idempotent order submission

---

### Sprint 4.3 – Trading Views

**Status: Completed (verified August 2, 2026)**

**Implementation plan:** [docs/plans/sprint-4-3-trading-views.md](../plans/sprint-4-3-trading-views.md)

**Stories**
- #3.4.1 – Current positions API
- #3.4.2 – Portfolio summary
- #3.5.1 – Recent orders
- #3.5.2 – Trade history
- #8.3.2 – Domain error types for trading, strategies, and backtests

**Exit**
- Users can simulate trades with correct P&L

---

## Milestone 5 – Dashboard (Angular Frontend)

Frontend note:
- Milestone 5 UI work should be implemented in the Angular application shell
- Any reusable client-side UI components referenced below are Angular components, not React components

### Sprint 5.1 – Shell & Navigation

**Status: Completed (Milestone 5 PR)**

**Implementation plan:** [docs/plans/sprint-5-1-shell-navigation.md](../plans/sprint-5-1-shell-navigation.md)

**Implementation prerequisite**
- Extend the minimal `apps/web` Angular scaffold introduced by Sprint 3.4
- Complete the authenticated layout shell, navigation, dashboard route, and reusable client-side API patterns before widget work begins

**Stories**
- #7.1.1 – Authenticated app shell
- #7.1.2 – Dashboard landing route
- #2.4.2 – Reusable symbol search UI component
- #1.1.1 – Create account with a passkey (Angular UI)
- #1.1.2 – Sign in with a passkey (Angular UI)

---

### Sprint 5.2 – Dashboard Widgets

**Status: Completed (Milestone 5 PR)**

**Implementation plan:** [docs/plans/sprint-5-2-dashboard-widgets.md](../plans/sprint-5-2-dashboard-widgets.md)

**Stories**
- #7.2.1 – Account summary card
- #7.2.2 – Positions preview
- #7.3.1 – Active strategies list
- #7.3.2 – Strategy quick actions
- #7.4.1 – Recent backtests widget
- #7.4.2 – Recent trades widget
- #7.5.1 – Independent widget loading
- #7.5.2 – Empty states
- #7.6.1 – UI consistency
- #7.6.2 – Performance basics

---

### Sprint 5.3 – Core Workflows UI

**Status: Completed (Milestone 5 PR)**

**Implementation plan:** [docs/plans/sprint-5-3-core-workflows-ui.md](../plans/sprint-5-3-core-workflows-ui.md)

**Integration coverage**
- Functional Strategy Lab create/edit/validate/delete workflow over Stories #4.2.1–#4.6.2
- Strategy → Backtest launch and results navigation over Stories #5.3.1–#5.4.2
- Paper market-order, portfolio, position, order, and execution workflow over Stories #3.2.2–#3.5.2
- Dashboard quick actions from Sprint 5.2 land on functional routes rather than placeholders

**Exit**
- Dashboard surfaces all core system data
- Both documented core UX flows are completable without curl or manual database ids

---

## Milestone 6 – AI Assistant / Kernel

### Sprint 6.1 – AI Infrastructure

**Implementation plan:** [docs/plans/sprint-6-1-ai-infrastructure.md](../plans/sprint-6-1-ai-infrastructure.md)

**Stories**
- #6.1.1 – AI service abstraction
- #6.1.2 – AI usage limits & guardrails
- #6.5.2 – Prompt & response logging
- #6.5.1 – AI disclaimers
- #8.5.2 – Feature flags for AI, limits, and experimental paths

---

### Sprint 6.2 – Strategy Intelligence

**Implementation plan:** [docs/plans/sprint-6-2-strategy-intelligence.md](../plans/sprint-6-2-strategy-intelligence.md)

**Stories**
- #6.2.1 – Explain strategy
- #6.2.2 – Detect logical red flags

---

### Sprint 6.3 – Backtest Intelligence

**Implementation plan:** [docs/plans/sprint-6-3-backtest-intelligence.md](../plans/sprint-6-3-backtest-intelligence.md)

**Stories**
- #6.3.1 – Explain backtest
- #6.3.2 – Identify failure modes
- #6.4.1 – Suggest improvements
- #6.4.2 – Diff-style explanation (optional MVP+)

**Exit**
- AI adds insight without touching execution

---

## Milestone 7 – Polish & Resilience

### Sprint 7.1 – Polish & Caching

**Implementation plan:** [docs/plans/sprint-7-1-polish-caching.md](../plans/sprint-7-1-polish-caching.md)

**Stories**
- #2.5.1 – In-memory cache
- #2.5.2 – Provider fallback guardrails
- UX and performance refinements

**Exit**
- System runs efficiently with caching and provider fallbacks

---

### Sprint 7.2 – Deployment & Hosting

**Implementation plan:** [docs/plans/sprint-7-2-deployment-hosting.md](../plans/sprint-7-2-deployment-hosting.md)

**Stories**
- #8.7.1 – Deployment pipeline (CI build and deploy to target environment)
- #8.7.2 – Hosting environment (API, DB, and scheduled jobs in single region)

**Exit**
- Application deployable to a single-region hosting environment
- CI builds and deploys the API and Angular frontend to the chosen target

---

## Final Notes

- This mapping is intentionally explicit
- Each sprint can be converted directly into tickets
- If a sprint slips, later sprints do not collapse
- Cutting scope is easiest in Milestones 6–7
- Ready-for-dev contracts and completed-plan history for Sprints 2.1–7.2 live under [docs/plans/](../plans/README.md); adopted defaults are usable unless an owner records an override

---

**File:** docs/product/ROADMAP.md
