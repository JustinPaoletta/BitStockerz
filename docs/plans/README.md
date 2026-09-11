# BitStockerz — Sprint Plans (remaining)

Active implementation contracts. Completed Milestone 2–7 plan files may be
removed after merge to `main`; recover them from git history if needed.
Delivery status lives in [ROADMAP.md](../product/ROADMAP.md).

| Sprint | Plan | Depends on | Readiness | Purpose |
|--------|------|------------|-----------|---------|
| 6.1 | [sprint-6-1-ai-infrastructure.md](./sprint-6-1-ai-infrastructure.md) | Milestone 5 (PR #11) | Done — combined PR #12 | AI provider abstraction, usage limits, safe logging, disclaimers, feature flags. |
| 6.2 | [sprint-6-2-strategy-intelligence.md](./sprint-6-2-strategy-intelligence.md) | 6.1 | Done — combined PR #12 | Explain-strategy and logical red-flag validation endpoints. |
| 6.3 | [sprint-6-3-backtest-intelligence.md](./sprint-6-3-backtest-intelligence.md) | 6.2 | Done — combined PR #12 (`#6.4.2` deferred) | Explain-backtest, failure modes, and improvement suggestions. |
| 7.1 | [sprint-7-1-polish-caching.md](./sprint-7-1-polish-caching.md) | 6.3 | Done — combined PR #12 | In-memory candle/symbol cache TTL and provider fallback guardrails. |
| 7.2 | [sprint-7-2-deployment-hosting.md](./sprint-7-2-deployment-hosting.md) | 7.1 + hosting accounts | Done in-repo — combined PR #12; live deploy needs secrets | CI deploy pipeline and single-region hosting for API + DB + jobs + web. |

**Completed (plans removed; see ROADMAP + merged PRs)**

| Milestone | Sprints | Evidence |
|-----------|---------|----------|
| 2–3 | 2.1–3.4 | [PR #9](https://github.com/JustinPaoletta/BitStockerz/pull/9) |
| 4 | 4.1–4.3 | [PR #10](https://github.com/JustinPaoletta/BitStockerz/pull/10) |
| 5 | 5.1–5.3 | [PR #11](https://github.com/JustinPaoletta/BitStockerz/pull/11) |

**Conventions**

- Branch pattern: `feat/sprint-{milestone}-{sprint}-{slug}` (see `.cursor/skills/sprint-delivery/reference.md`).
- Stacked PR rule: Sprint N+1 targets Sprint N’s branch until N merges to `main`.
- Every plan uses the same section template (scope → acceptance criteria → API → architecture → implementation → defaults/JCs → DoD).
- Acceptance criteria in these plans are binding. Sync them into the story files in the implementation PR; do not wait for a second planning pass.
- The value in each plan’s “Default” or “Decision” column is adopted unless an owner explicitly records an override. A judgment call is not a coding blocker when its default is usable.
- “External prerequisite” means credentials, accounts, a deployed predecessor, or another real dependency must exist before that slice can execute. It does not invalidate the rest of the plan.
- Before coding, compare the plan with shipped code on `main`. If contracts changed, update this plan and downstream plans in the same PR rather than silently forking the contract.

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

**Canonical domain-error codes (shipped + upcoming)**

Generic `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, and `INTERNAL_ERROR` remain available. Domain codes already shipped:

| Owner | Codes |
|-------|-------|
| Strategy Lab | `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, `STRATEGY_VALIDATION_ERROR` |
| Backtesting | `BACKTEST_INVALID_DEFINITION`, `BACKTEST_INSUFFICIENT_BARS`, `BACKTEST_BAR_LIMIT_EXCEEDED`, `BACKTEST_RESOURCE_LIMIT_EXCEEDED`, `BACKTEST_TIMEOUT`, `BACKTEST_NOT_FOUND`, `BACKTEST_INVALID_STATE` |
| Paper trading | `TRADING_ACCOUNT_INACTIVE`, `TRADING_NO_MARKET_PRICE`, `TRADING_INSUFFICIENT_CASH`, `TRADING_INSUFFICIENT_POSITION`, `TRADING_RISK_LIMIT` |
| AI | `AI_DISABLED`, `AI_RATE_LIMIT`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT` |

Do not add near-duplicates such as `STRATEGY_INVALID`, `BACKTEST_LIMIT_EXCEEDED`, or `BACKTEST_VALIDATION_ERROR`.

**Cross-sprint contracts still binding for remaining work**

| Topic | Canonical decision |
|-------|-------------------|
| Strategy definition operand for numbers | `{ "literal": number }` (not `constant`) |
| Definition validation | Pure `StrategyDefinitionValidator` + `class-validator` DTOs |
| SL/TP in MVP definitions | Both required as `risk.stop_loss` / `risk.take_profit` `{ type: "percent", value }` |
| Indicator math | In-repo pure SMA/EMA/RSI |
| Backtest execution | Long-only, 100% equity, zero fees/slippage, signal-bar close fills, stop-first on same-bar SL/TP, no same-bar re-entry |
| Paper-trading valuation | Latest eligible close; missing prices fail closed; cash/aggregate currency values use 2dp |
| AI output | Non-streaming MVP responses use AI SDK structured output with runtime schemas; malformed provider output fails closed |
| Provider fallback | Production never falls back to synthetic seed data; serve last-known DB data and report degraded health |
| Hosting default | Option A: always-on API host (Fly.io) + Vercel Angular + managed MySQL |

**Execution sequence (MVP complete in-repo)**

```text
6.1 → 6.2 → 6.3 → 7.1 → 7.2
```

Ops runbook: [docs/ops/deployment.md](../ops/deployment.md).
