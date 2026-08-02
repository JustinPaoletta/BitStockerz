# BitStockerz — Sprint Plans (2.1 → 7.2)

Index of implementation contracts after Milestone 1. “Ready” means a developer may start with the documented defaults; it does not mean the sprint has shipped. Completed rows record the locally verified implementation state.

| Sprint | Plan | Depends on | Readiness | Purpose |
|--------|------|------------|-----------|---------|
| 2.1 | [sprint-2-1-strategy-persistence-versioning.md](./sprint-2-1-strategy-persistence-versioning.md) | Milestone 1 | Implemented locally (verified; unmerged in PR #9) | Strategy schema + versioning persistence for Strategy Lab. |
| 2.2 | [sprint-2-2-indicators-rule-schema.md](./sprint-2-2-indicators-rule-schema.md) | 2.1 | Implemented locally (verified; unmerged in PR #9) | Indicator catalog and entry/exit/SL/TP rule schema. |
| 2.3 | [sprint-2-3-strategy-crud-validation.md](./sprint-2-3-strategy-crud-validation.md) | 2.2 | Implemented locally (verified; unmerged in PR #9) | Strategy CRUD APIs, validation, and human-readable summaries. |
| 3.1 | [sprint-3-1-backtest-engine-core.md](./sprint-3-1-backtest-engine-core.md) | 2.3 | Implemented locally (verified; unmerged in PR #9) | Backtest engine interface, indicators, rules, trade sim, sandbox limits. |
| 3.2 | [sprint-3-2-backtest-persistence.md](./sprint-3-2-backtest-persistence.md) | 3.1 | Implemented locally (verified; unmerged in PR #9) | Backtest run/result/trades/equity storage and strategy version pinning. |
| 3.3 | [sprint-3-3-backtest-execution-limits.md](./sprint-3-3-backtest-execution-limits.md) | 3.2 | Implemented locally (verified; unmerged in PR #9) | Run/list/detail APIs, bar limits, diagnostics. |
| 3.4 | [sprint-3-4-backtest-ui.md](./sprint-3-4-backtest-ui.md) | 3.3 | Implemented locally (verified; unmerged in PR #9) | Angular equity-curve chart and trades table for backtest results. |
| 4.1 | [sprint-4-1-accounts-positions.md](./sprint-4-1-accounts-positions.md) | 3.4 | **START HERE — Ready** | Default paper account, positions table, cash balance updates. |
| 4.2 | [sprint-4-2-orders-executions.md](./sprint-4-2-orders-executions.md) | 4.1 | Ready | Order schema, market orders, executions, risk limits, idempotency. |
| 4.3 | [sprint-4-3-trading-views.md](./sprint-4-3-trading-views.md) | 4.2 | Ready | Positions/portfolio/orders/history APIs and trading domain errors. |
| 5.1 | [sprint-5-1-shell-navigation.md](./sprint-5-1-shell-navigation.md) | 4.3 + 3.4 web scaffold | Ready | Angular shell/nav/dashboard route + symbol search. |
| 5.2 | [sprint-5-2-dashboard-widgets.md](./sprint-5-2-dashboard-widgets.md) | 5.1 | Ready | Dashboard widgets with independent loading, empty states, UX consistency. |
| 5.3 | [sprint-5-3-core-workflows-ui.md](./sprint-5-3-core-workflows-ui.md) | 5.2 | Ready | Functional Strategy Lab, backtest launch, and paper-trading UI flows. |
| 6.1 | [sprint-6-1-ai-infrastructure.md](./sprint-6-1-ai-infrastructure.md) | 5.3 | Ready | AI provider abstraction, usage limits, safe logging, disclaimers, feature flags. |
| 6.2 | [sprint-6-2-strategy-intelligence.md](./sprint-6-2-strategy-intelligence.md) | 6.1 | Ready | Explain-strategy and logical red-flag validation endpoints. |
| 6.3 | [sprint-6-3-backtest-intelligence.md](./sprint-6-3-backtest-intelligence.md) | 6.2 | Ready | Explain-backtest, failure modes, and improvement suggestions. |
| 7.1 | [sprint-7-1-polish-caching.md](./sprint-7-1-polish-caching.md) | 6.3 | Ready | In-memory candle/symbol cache TTL and provider fallback guardrails. |
| 7.2 | [sprint-7-2-deployment-hosting.md](./sprint-7-2-deployment-hosting.md) | 7.1 + hosting accounts | Ready with external provisioning | CI deploy pipeline and single-region hosting for API + DB + jobs + web. |

**Conventions**

- Branch pattern: `feat/sprint-{milestone}-{sprint}-{slug}` (see `.cursor/skills/sprint-delivery/reference.md`).
- Stacked PR rule: Sprint N+1 targets Sprint N’s branch until N merges to `main`.
- Every plan uses the same section template (scope → acceptance criteria → API → architecture → implementation → defaults/JCs → DoD).
- Acceptance criteria in these plans are binding. Sync them into the story files in the implementation PR; do not wait for a second planning pass.
- The value in each plan’s “Default” or “Decision” column is adopted unless an owner explicitly records an override. A judgment call is not a coding blocker when its default is usable.
- “External prerequisite” means credentials, accounts, a deployed predecessor, or another real dependency must exist before that slice can execute. It does not invalidate the rest of the plan.
- Before coding, compare the plan with the merged predecessor. If shipped code changed a contract, update the affected plan and downstream plans in the same PR rather than silently forking the contract.

**Repository-wide implementation rules**

| Concern | Contract |
|---------|----------|
| HTTP | Global prefix `/api`; request/response JSON is `snake_case`; authenticated ownership misses return 404 to avoid existence leaks. |
| Time | Persist UTC; API timestamps are ISO-8601 UTC. Date ranges are inclusive at both ends unless a plan explicitly states otherwise. |
| Decimal values | API emits decimal-backed values as strings. Quantities and unit prices use 8 decimal places; base-currency cash and aggregate monetary values use 2 decimal places. |
| Cash rounding | Cash debits/credits round `quantity × price` to 2 decimals with `ROUND_HALF_UP`. Risk checks use the same rounded cash notional for cash constraints and the unrounded value for max-notional comparison. |
| Pagination | Offset lists use `limit` + `offset` and return the same values plus `has_more`. Ordering includes a stable id tie-breaker after the documented primary sort. |
| Persistence parity | Any sprint that adds a Prisma-backed domain path must cover the in-memory/seed path and a MySQL-backed verification path. Pure compute sprints do not require MySQL. |
| State changes | Multi-row financial and result writes are atomic. Completed backtest results/trades and strategy versions are append-only/immutable. |
| Observability | Logs must not contain bearer tokens, secrets, full strategy definitions, full prompts, full responses, trades arrays, or equity curves. Use ids, lengths/hashes, bounded diagnostics, and request ids. |
| Testing | Run build, lint, unit, coverage, and relevant e2e gates named by the plan. Add contract tests for response shape and deterministic ordering, not only happy-path status codes. |

**Canonical domain-error rollout**

Generic `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, and `INTERNAL_ERROR` remain available. Domain codes are added by their first owning sprint and reused unchanged later:

| Owner | Codes |
|-------|-------|
| 2.3 | `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, `STRATEGY_VALIDATION_ERROR` |
| 3.1–3.3 | `BACKTEST_INVALID_DEFINITION`, `BACKTEST_INSUFFICIENT_BARS`, `BACKTEST_BAR_LIMIT_EXCEEDED`, `BACKTEST_RESOURCE_LIMIT_EXCEEDED`, `BACKTEST_TIMEOUT`, `BACKTEST_NOT_FOUND`, `BACKTEST_INVALID_STATE` |
| 4.1–4.2 | `TRADING_ACCOUNT_INACTIVE`, `TRADING_NO_MARKET_PRICE`, `TRADING_INSUFFICIENT_CASH`, `TRADING_INSUFFICIENT_POSITION`, `TRADING_RISK_LIMIT` |
| 6.1 | `AI_DISABLED`, `AI_RATE_LIMIT`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT` |

Do not add near-duplicates such as `STRATEGY_INVALID`, `BACKTEST_LIMIT_EXCEEDED`, or `BACKTEST_VALIDATION_ERROR`. Sprint 4.3 completes the exhaustive enum/catalog test; it does not rename codes already shipped.

**Cross-sprint contracts (read before implementing)**

| Topic | Canonical decision | Plans |
|-------|-------------------|--------|
| Strategy definition operand for numbers | `{ "literal": number }` (not `constant`) | 2.2 owns schema; 3.1 engine must match |
| Definition validation | Pure `StrategyDefinitionValidator` + `class-validator` DTOs (not Zod unless team later standardizes) | 2.2 / 2.3 / 3.1 |
| SL/TP in MVP definitions | Both required as `risk.stop_loss` / `risk.take_profit` `{ type: "percent", value }` | 2.2; engine may still defensively skip if absent |
| Indicator math | In-repo pure SMA/EMA/RSI (no `technicalindicators` unless JC reversed) | 2.2 JC-8, 3.1 |
| Backtest execution | Long-only, 100% equity, zero fees/slippage, signal-bar close fills, stop-first on same-bar SL/TP, and no same-bar re-entry | 3.1 owns semantics; later plans consume them |
| Backtest timeout | Synchronous engine checks both external abort and a monotonic deadline inside its loop; a timer/`AbortSignal.timeout()` alone cannot interrupt CPU-bound synchronous work | 3.1 / 3.3 |
| Angular scaffold | Pull forward minimal `apps/web` in **3.4**; **5.1** extends shell/nav/dashboard (do not re-scaffold) | 3.4 JC-1, 5.1 |
| Paper-trading valuation | Latest eligible close; missing prices fail closed; cash/aggregate currency values use 2dp | 4.1–4.3 |
| AI output | Non-streaming MVP responses use AI SDK structured output with runtime schemas; malformed provider output fails closed rather than returning unvalidated text | 6.1–6.3 |
| Provider fallback | Production never falls back to synthetic seed data. It serves last-known DB data and reports degraded health; seed fallback is development/test only | 7.1 |
| Hosting default | Option A: always-on API host + Vercel Angular + managed MySQL | 7.2 |

**Execution sequence**

```text
2.1 → 2.2 → 2.3 → 3.1 → 3.2 → 3.3 → 3.4
    → 4.1 → 4.2 → 4.3 → 5.1 → 5.2 → 5.3
    → 6.1 → 6.2 → 6.3 → 7.1 → 7.2
```

Sprint 3.4 owns the initial thin Angular scaffold. Sprint 5.1 must extend it. Optional/stretch items never block a sprint’s definition of done unless their judgment-call decision is explicitly reversed.

**Milestone grouping**

- **Milestone 2** — Strategy Lab Core (2.1–2.3)
- **Milestone 3** — Backtesting Engine (3.1–3.4)
- **Milestone 4** — Paper Trading (4.1–4.3)
- **Milestone 5** — Angular Dashboard + Core Workflows (5.1–5.3)
- **Milestone 6** — AI Kernel (6.1–6.3)
- **Milestone 7** — Polish & Deployment (7.1–7.2)
