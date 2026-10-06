# BitStockerz — Documentation and contributor guide

Completed sprint plans have been consolidated into the maintained guides below.
Their unresolved external requirements remain in [PRODUCT_TASKLIST.md](../../PRODUCT_TASKLIST.md).
Original story acceptance criteria remain in [product stories](../product/stories).
The [roadmap](../product/ROADMAP.md) preserves delivery history and sprint identifiers.

## Maintained sources

| Topic                                         | Source                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| HTTP shapes, route access, and errors         | [API inventory](../database/API_Inventory.md) and generated OpenAPI                                                |
| Configuration and operator commands           | [API README](../../apps/api/README.md)                                                                             |
| Research, paper runners, and account controls | [Product extensions](../product/PRODUCT_EXTENSIONS.md)                                                             |
| Database changes and lifecycle                | [Migrations](../database/Migrations_Plan.md), [deletion policy](../database/Data_Lifecycle_and_Deletion_Policy.md) |
| OAuth identities and production access        | [Security](../product/requirements/Security.md), [deployment](../ops/deployment.md)                                |
| Gates and evidence                            | [Testing strategy](../product/requirements/Testing_Strategy.md)                                                    |
| Logging and diagnostic limits                 | [Observability](../product/requirements/Observability.md)                                                          |

## Contributions

Use `codex/` for new Codex branches unless the user specifies another name.
Historical sprint branches use `feat/sprint-{milestone}-{sprint}-{slug}`.
A stacked PR targets its predecessor until that predecessor merges into `main`.

Before implementation, compare the relevant acceptance criteria with current source.
Keep adopted defaults unless an owner records an override.
Update affected contracts and story criteria in the implementation PR.
Accounts, credentials, and live-provider tests can remain external prerequisites without blocking independent code work.

## Implementation contracts

| Concern            | Contract                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP               | Global prefix `/api`; domain JSON uses `snake_case`; Problem Details and health retain documented camelCase fields; authenticated ownership misses return 404 to avoid existence leaks.                   |
| Time               | Persist UTC; API timestamps are ISO-8601 UTC. Date ranges are inclusive at both ends unless the route contract states otherwise.                                                                          |
| Decimal values     | API emits decimal-backed values as strings. Quantities and unit prices use 8 decimal places; base-currency cash and aggregate monetary values use 2 decimal places.                                       |
| Cash rounding      | Cash debits/credits round `quantity × price` to 2 decimals with `ROUND_HALF_UP`. Risk checks use the same rounded cash notional for cash constraints and the unrounded value for max-notional comparison. |
| Pagination         | Offset lists use `limit` + `offset` and return the same values plus `has_more`. Ordering includes a stable id tie-breaker after the documented primary sort.                                              |
| Persistence parity | Any sprint that adds a Prisma-backed domain path must cover the in-memory/seed path and a MySQL-backed verification path. Pure compute sprints do not require MySQL.                                      |
| State changes      | Multi-row financial and result writes are atomic. Completed backtest results/trades and strategy versions are append-only/immutable.                                                                      |
| Observability      | Logs must not contain bearer tokens, secrets, full strategy definitions, full prompts, full responses, trades arrays, or equity curves. Use ids, lengths/hashes, bounded diagnostics, and request ids.    |
| Testing            | Run build, lint, unit, coverage, and relevant e2e gates named by the plan. Add contract tests for response shape and deterministic ordering, not only happy-path status codes.                            |

## Domain errors

Generic `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, and `INTERNAL_ERROR` remain available. Domain codes already shipped:

| Owner         | Codes                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy Lab  | `STRATEGY_NOT_FOUND`, `STRATEGY_VERSION_NOT_FOUND`, `STRATEGY_VALIDATION_ERROR`                                                                                                                    |
| Backtesting   | `BACKTEST_INVALID_DEFINITION`, `BACKTEST_INSUFFICIENT_BARS`, `BACKTEST_BAR_LIMIT_EXCEEDED`, `BACKTEST_RESOURCE_LIMIT_EXCEEDED`, `BACKTEST_TIMEOUT`, `BACKTEST_NOT_FOUND`, `BACKTEST_INVALID_STATE` |
| Paper trading | `TRADING_ACCOUNT_INACTIVE`, `TRADING_NO_MARKET_PRICE`, `TRADING_INSUFFICIENT_CASH`, `TRADING_INSUFFICIENT_POSITION`, `TRADING_RISK_LIMIT`                                                          |
| AI            | `AI_DISABLED`, `AI_RATE_LIMIT`, `AI_PROVIDER_ERROR`, `AI_TIMEOUT`                                                                                                                                  |

Do not add near-duplicates such as `STRATEGY_INVALID`, `BACKTEST_LIMIT_EXCEEDED`, or `BACKTEST_VALIDATION_ERROR`.

## Domain decisions

| Topic                                   | Canonical decision                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Strategy definition operand for numbers | `{ "literal": number }` (not `constant`)                                                                                                                                                               |
| Definition validation                   | Pure `StrategyDefinitionValidator` + `class-validator` DTOs                                                                                                                                            |
| SL/TP in MVP definitions                | Both required as `risk.stop_loss` / `risk.take_profit` `{ type: "percent", value }`                                                                                                                    |
| Indicator math                          | In-repo pure SMA/EMA/RSI                                                                                                                                                                               |
| Backtest execution                      | Long-only; legacy defaults are 100% equity, zero costs, signal-close fills. Optional allocation/costs/next-open settings are pinned per run; stop-first intrabar exits and no same-bar re-entry remain |
| Paper-trading valuation                 | Latest eligible close; missing prices fail closed; cash/aggregate currency values use 2dp                                                                                                              |
| AI output                               | Non-streaming MVP responses use AI SDK structured output with runtime schemas; malformed provider output fails closed                                                                                  |
| Provider fallback                       | Production never falls back to synthetic seed data; serve last-known DB data and report degraded health                                                                                                |
| Hosting default                         | Option A: always-on API host (Fly.io) + Vercel Angular + managed MySQL                                                                                                                                 |

## Cache and provider contracts

`TtlCacheService` uses normalized query keys, expiry, and deterministic least-recently-used eviction.
Keys include symbol, asset type, interval, inclusive UTC range, order, and limit.
Concurrent identical loads share one pending request.
Successful empty results can be cached; thrown errors cannot.
Callers cannot mutate cached values.

Ingestion invalidates all affected symbol ranges after the database transaction commits.
Cache metrics use namespaces, never individual symbols or keys.

Provider failures preserve existing database bars and expose degraded health.
Circuit-breaker failures and cooldown are bounded configuration values.
Production must never substitute seed prices or an AI stub for a missing live provider.

## Kernel contracts

Kernel uses non-streaming structured output with runtime validation.
It has no order, strategy-write, or job-execution tools.
Names and definitions are untrusted prompt data.
Prompts summarize bounded context rather than sending complete trade arrays.
Malformed provider output returns `AI_PROVIDER_ERROR`.

Quota consumption is atomic for each user and UTC day.
Disabled, invalid, or over-quota requests consume no call.
An upstream attempt consumes one call even if it fails; SDK retries do not consume additional application calls.
Deterministic strategy findings merge with validated model warnings.
Their severity takes precedence when equivalent findings conflict.

Backtest explanation requires an owned completed run with results.
Its context must use the run's pinned version; the current latest-summary conflict remains in the task list.

Each success includes `disclaimer`, server-computed `confidence`, and `ai_request_id`.
Confidence is a label, not a probability of future profit.
The current disclaimer requires owner/legal inspection before public AI enablement.
Parameter previews follow the [extension contract](../product/PRODUCT_EXTENSIONS.md#kernel-and-operations).
They never modify strategies automatically.

## Documentation writing

Use [ASD-STE100 Issue 9](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf), dated January 15, 2025.
Use approved meanings and permitted technical terms.
Keep identifiers, literal interface labels, units, and supported conditions exact.

- Use active voice and one instruction per sentence.
- Put each condition before its instruction.
- Limit instruction sentences to 20 words and descriptions to 25 words.
- Keep each paragraph on one topic with no more than six sentences.
- Use one term for each concept and do not use contractions.
- Separate current behavior, proposed work, and dated test evidence.
- Keep unfinished acceptance conditions when removing completed plans.
- Do local link, anchor, format, and example checks after edits.

The writing helper finds selected clarity problems.
Its output does not establish full ASD-STE100 conformity.

| Term          | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| Seed mode     | Local in-memory storage with synthetic market fixtures.            |
| Paper account | Simulated cash and positions without real-money execution.         |
| Runner        | A saved-version paper strategy evaluated against completed bars.   |
| Handoff       | A short-lived OAuth code bound to the initiating browser verifier. |
| Basis point   | One hundredth of a percentage point.                               |
| Migration     | A versioned database-schema change.                                |
