# BitStockerz — Product roadmap

Updated October 8, 2026.
This record maps delivered milestones to the original stories.
[PRODUCT_TASKLIST.md](../../PRODUCT_TASKLIST.md) is the single checklist for unfinished work.
The [deployment runbook](../ops/deployment.md) contains external setup and live acceptance procedures.

## Delivery history

| Scope              | Evidence                                                        | Delivery                                                                                         |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Milestones 0–1     | Original story records and changelog                            | Foundation, auth, market-data reads, jobs, and observability.                                    |
| Milestones 2–3     | [PR #9](https://github.com/JustinPaoletta/BitStockerz/pull/9)   | Strategy Lab, deterministic backtesting, persistence, execution APIs, and initial UI.            |
| Milestone 4        | [PR #10](https://github.com/JustinPaoletta/BitStockerz/pull/10) | Paper accounts, atomic orders, positions, portfolio, and history.                                |
| Milestone 5        | [PR #11](https://github.com/JustinPaoletta/BitStockerz/pull/11) | Angular shell, dashboard, and core workflows.                                                    |
| Milestones 6–7     | [PR #12](https://github.com/JustinPaoletta/BitStockerz/pull/12) | Kernel, cache/provider guardrails, and deployment artifacts; merged October 2, 2026.             |
| Prelaunch 8.1–8.2  | [PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13) | Browser OAuth, profile/recovery, P&L, chart markers, and security fixes; merged October 2, 2026. |
| Product extensions | [PR #15](https://github.com/JustinPaoletta/BitStockerz/pull/15) | Merged October 5 (EDT); CI and MySQL passed; live checks pending.                                |

P&L and trade markers required no migration.
October 4 work adds research, enrollment, and workspace migrations.
No production deployment is recorded by this document.

## Original sprint and story mapping

Completed implementation plans have been consolidated into [current contracts](../plans/README.md).
Original acceptance criteria remain under [stories](stories).

| Sprint | Scope                             | Story identifiers                                                              | Status                          |
| ------ | --------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| 0.1    | Core Infra Baseline               | #8.3.1, #8.4.1, #8.5.1, #8.6.2                                                 | Merged                          |
| 0.2    | Authentication & Profile MVP      | #1.1.1, #1.1.2, #1.1.3, #1.1.4, #1.1.5, #1.1.6, #1.2.1, #1.2.2, #1.4.1         | Merged                          |
| 1.1    | Symbols & Schemas                 | #2.1.1, #2.1.2, #2.1.3, #2.2.1, #2.3.1, #2.4.1                                 | Merged                          |
| 1.2    | Market Data Read APIs             | #2.2.3, #2.3.3                                                                 | Merged                          |
| 1.3    | Data Ingestion & Jobs             | #2.2.2, #2.3.2, #8.1.1, #8.1.2, #8.1.3, #8.6.1                                 | Merged                          |
| 1.4    | Data Health & Observability       | #2.6.1, #2.6.2, #8.4.2, #8.4.3                                                 | Merged                          |
| 2.1    | Strategy Persistence & Versioning | #4.1.1, #4.1.2                                                                 | Merged                          |
| 2.2    | Indicators & Rule Schema          | #4.2.1, #4.3.1, #4.3.2, #4.3.3, #4.4.1, #4.4.2                                 | Merged                          |
| 2.3    | Strategy CRUD & Validation        | #4.5.1, #4.5.2, #4.5.3, #4.5.4, #4.5.5, #4.6.1, #4.6.2                         | Merged                          |
| 3.1    | Backtest Engine Core              | #5.2.1, #5.2.2, #5.2.3, #5.2.4, #5.2.5, #8.2.1, #8.2.2                         | Merged                          |
| 3.2    | Backtest Persistence              | #5.1.1, #5.1.2, #5.1.3, #5.6.1                                                 | Merged                          |
| 3.3    | Backtest Execution & Limits       | #5.3.1, #5.3.2, #5.3.3, #5.5.1, #5.5.2                                         | Merged                          |
| 3.4    | Backtest UI                       | #5.4.1, #5.4.2                                                                 | Merged                          |
| 4.1    | Accounts & Positions              | #1.3.1, #3.1.1, #3.3.2, #3.3.3                                                 | Merged                          |
| 4.2    | Orders & Executions               | #3.2.1, #3.2.2, #3.3.1, #3.6.1, #3.6.2                                         | Merged                          |
| 4.3    | Trading Views                     | #3.4.1, #3.4.2, #3.5.1, #3.5.2, #8.3.2                                         | Merged                          |
| 5.1    | Shell & Navigation                | #7.1.1, #7.1.2, #2.4.2, #1.1.1, #1.1.2                                         | Merged                          |
| 5.2    | Dashboard Widgets                 | #7.2.1, #7.2.2, #7.3.1, #7.3.2, #7.4.1, #7.4.2, #7.5.1, #7.5.2, #7.6.1, #7.6.2 | Merged                          |
| 5.3    | Core Workflows UI                 | Workflow integration                                                           | Merged                          |
| 6.1    | AI Infrastructure                 | #6.1.1, #6.1.2, #6.5.2, #6.5.1, #8.5.2                                         | Merged                          |
| 6.2    | Strategy Intelligence             | #6.2.1, #6.2.2                                                                 | Merged                          |
| 6.3    | Backtest Intelligence             | #6.3.1, #6.3.2, #6.4.1                                                         | Merged; #6.4.2 merged in PR #15 |
| 7.1    | Polish & Caching                  | #2.5.1, #2.5.2                                                                 | Merged                          |
| 7.2    | Deployment & Hosting              | #8.7.1, #8.7.2                                                                 | Merged; live checks pending     |
| 8.1    | Google/Apple Browser Login        | #1.1.3–#1.1.4                                                                  | Merged; live checks pending     |
| 8.2    | Profile and Account Recovery      | #1.2.1–#1.2.2, #1.1.6                                                          | Merged; live checks pending     |

## October 4 product extensions

Merged code includes richer strategy editing, templates, duplication, allocation, costs, and next-open backtests.
Research adds benchmarks, comparison, pinned exports, and a user-selected out-of-sample label.
Paper runners add saved-version evaluation, controls, and activity.
Markets adds price charts, indicator overlays, and watchlists.
Account controls add extra passkeys, session revocation, reset archives, export, and deletion.
Kernel story #6.4.2 adds parameter previews under a disabled flag.

The licensed importer and Alpaca adapter are implemented; data rights, credentials, and live ingestion remain external work.
Read the [extension limits](PRODUCT_EXTENSIONS.md) before advertising these capabilities.
Local test evidence is separate from hosted and real-provider evidence.

## Remaining delivery order

1. Require passing CI on each release revision; PR #15 passed all five MySQL gates.
2. Provision hosting and exact HTTPS origins.
3. Load licensed data and complete deployed auth and product smoke tests.
4. Complete backup, restoration, rollback, alert, support, and retention setup.
5. Enable optional current-market scheduling and Kernel only after their live prerequisites pass.

Keep one API instance while auth caches, rate limits, scheduling, and runner locks remain process-local.
The product remains a research and simulated-trading tool; real-money execution is outside the current scope.
