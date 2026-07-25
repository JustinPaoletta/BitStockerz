# BitStockerz — Remaining Sprint Plans (2.1 → 7.2)

Index of ready-for-dev plans after Milestone 1. Each file is the implementation contract for its sprint. Status columns reflect planning readiness, not shipping status.

| Sprint | Plan | Purpose |
|--------|------|---------|
| 2.1 | [sprint-2-1-strategy-persistence-versioning.md](./sprint-2-1-strategy-persistence-versioning.md) | Strategy schema + versioning persistence for Strategy Lab. |
| 2.2 | [sprint-2-2-indicators-rule-schema.md](./sprint-2-2-indicators-rule-schema.md) | Indicator catalog and entry/exit/SL/TP rule schema. |
| 2.3 | [sprint-2-3-strategy-crud-validation.md](./sprint-2-3-strategy-crud-validation.md) | Strategy CRUD APIs, validation, and human-readable summaries. |
| 3.1 | [sprint-3-1-backtest-engine-core.md](./sprint-3-1-backtest-engine-core.md) | Backtest engine interface, indicators, rules, trade sim, sandbox limits. |
| 3.2 | [sprint-3-2-backtest-persistence.md](./sprint-3-2-backtest-persistence.md) | Backtest run/result/trades/equity storage and strategy version pinning. |
| 3.3 | [sprint-3-3-backtest-execution-limits.md](./sprint-3-3-backtest-execution-limits.md) | Run/list/detail APIs, bar limits, diagnostics. |
| 3.4 | [sprint-3-4-backtest-ui.md](./sprint-3-4-backtest-ui.md) | Angular equity-curve chart and trades table for backtest results. |
| 4.1 | [sprint-4-1-accounts-positions.md](./sprint-4-1-accounts-positions.md) | Default paper account, positions table, cash balance updates. |
| 4.2 | [sprint-4-2-orders-executions.md](./sprint-4-2-orders-executions.md) | Order schema, market orders, executions, risk limits, idempotency. |
| 4.3 | [sprint-4-3-trading-views.md](./sprint-4-3-trading-views.md) | Positions/portfolio/orders/history APIs and trading domain errors. |
| 5.1 | [sprint-5-1-shell-navigation.md](./sprint-5-1-shell-navigation.md) | Angular shell/nav/dashboard route + symbol search (extend 3.4 scaffold if present). |
| 5.2 | [sprint-5-2-dashboard-widgets.md](./sprint-5-2-dashboard-widgets.md) | Dashboard widgets with independent loading, empty states, UX consistency. |
| 6.1 | [sprint-6-1-ai-infrastructure.md](./sprint-6-1-ai-infrastructure.md) | AI provider abstraction, usage limits, logging, disclaimers, feature flags. |
| 6.2 | [sprint-6-2-strategy-intelligence.md](./sprint-6-2-strategy-intelligence.md) | Explain-strategy and logical red-flag validation endpoints. |
| 6.3 | [sprint-6-3-backtest-intelligence.md](./sprint-6-3-backtest-intelligence.md) | Explain-backtest, failure modes, improvement suggestions (+ optional diff). |
| 7.1 | [sprint-7-1-polish-caching.md](./sprint-7-1-polish-caching.md) | In-memory candle/symbol cache TTL and provider fallback guardrails. |
| 7.2 | [sprint-7-2-deployment-hosting.md](./sprint-7-2-deployment-hosting.md) | CI deploy pipeline and single-region hosting for API + DB + jobs + web. |

**Conventions**

- Branch pattern: `feat/sprint-{milestone}-{sprint}-{slug}` (see `.cursor/skills/sprint-delivery/reference.md`).
- Stacked PR rule: Sprint N+1 targets Sprint N’s branch until N merges to `main`.
- Every plan uses the same section template (scope → AC → API → architecture → implementation → JCs → DoD).
- **`## Judgement calls`** sections mark ambiguous product/architecture decisions. Resolve or explicitly accept defaults before coding those slices.

**Cross-sprint contracts (read before implementing)**

| Topic | Canonical decision | Plans |
|-------|-------------------|--------|
| Strategy definition operand for numbers | `{ "literal": number }` (not `constant`) | 2.2 owns schema; 3.1 engine must match |
| Definition validation | Pure `StrategyDefinitionValidator` + `class-validator` DTOs (not Zod unless team later standardizes) | 2.2 / 2.3 / 3.1 |
| SL/TP in MVP definitions | Both required as `risk.stop_loss` / `risk.take_profit` `{ type: "percent", value }` | 2.2; engine may still defensively skip if absent |
| Indicator math | In-repo pure SMA/EMA/RSI (no `technicalindicators` unless JC reversed) | 2.2 JC-8, 3.1 |
| Angular scaffold | Prefer pull-forward minimal `apps/web` in **3.4**; **5.1** extends shell/nav/dashboard (do not re-scaffold) | 3.4 JC-1, 5.1 |
| Hosting default | Option A: always-on API host + Vercel Angular + managed MySQL | 7.2 |

**Milestone grouping**

- **Milestone 2** — Strategy Lab Core (2.1–2.3)
- **Milestone 3** — Backtesting Engine (3.1–3.4)
- **Milestone 4** — Paper Trading (4.1–4.3)
- **Milestone 5** — Angular Dashboard (5.1–5.2)
- **Milestone 6** — AI Kernel (6.1–6.3)
- **Milestone 7** — Polish & Deployment (7.1–7.2)
