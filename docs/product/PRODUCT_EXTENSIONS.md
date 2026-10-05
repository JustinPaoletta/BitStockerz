# Product extensions — October 4, 2026

These changes are implemented in the working tree. Local verification does not
establish deployment, live-provider operation, or MySQL persistence. See
[the task list](../../PRODUCT_TASKLIST.md) and [deployment runbook](../ops/deployment.md).
The runnable Prisma schema and migrations are the database authority.

## Strategy research

The Angular builder preserves up to 20 SMA/EMA/RSI indicators and price/indicator/number operands.
Each entry/exit group supports up to 10 AND conditions. Crossovers compare consecutive bars. Renaming an indicator
updates its references; removing one replaces its references with close price
and prompts users to review and validate. Starter crossover and RSI templates
are editable definitions. Duplication creates a separate strategy and version.

Backtest creation accepts an optional `simulation` object:

```json
{
  "allocation_pct": 50,
  "commission_bps": 10,
  "slippage_bps": 10,
  "execution_timing": "next_open",
  "evaluation_period": "out_of_sample"
}
```

Defaults retain the original long-only model: 100% allocation, zero costs,
signal-close fills, stop-first intrabar exits, no same-bar re-entry and final
liquidation. Allocation is 0.01–100%; each cost is 0–1000 basis points per side.
Commissions reduce cash and net trade P&L; slippage moves fills adversely.

Next-open signals execute on the next available bar; final-bar entry signals
expire. Positions opened at the next open can encounter risk exits on that bar.
Signal-close entries encounter risk exits on subsequent bars. Fees and results
use the existing decimal-string persistence contract. Quantization tolerances
are bounded by persisted eight-decimal price/quantity precision.

A buy-and-hold benchmark uses the same bars, allocation and costs, entering at
the first close or second open and liquidating at the final close. This is a
price-only comparison; no dividends, tax, spread/liquidity or market-impact
model is claimed. Completed historical results remain immutable. Existing runs
without benchmark data are not recalculated.

Comparison shows two owned runs, pinned definitions/versions, assumptions and
metrics, and warns about incompatible symbols/ranges/capital/settings. The
out-of-sample label records a user-selected separate date range; it does not
perform automatic train/test splitting or prevent reuse of a tuning period.
Research export remains readable after strategy soft deletion. CSV exports
include complete run parameters/results or all owned trades, with quoted cells
and neutralized spreadsheet formulas. Rerunning uses the latest saved version.

## Forward paper testing

A runner pins an owned strategy version and reserves a matching symbol. It
starts paused, allocates a chosen percentage of available cash and evaluates
the newest completed daily/hourly bar. Scheduling shares
`INGESTION_SCHEDULER_ENABLED` and requires database mode. It runs hourly at
minute 20, after the ingestion schedule. Manual evaluation is owner scoped.

Entry/exit rules and risk exits use the latest close. Stop/target checks are
close-based, unlike historical intrabar simulation. Missed bars are not replayed.

Account cash/notional/position limits remain enforced; allocations can be
rejected by those limits. Stale, incomplete or mismatched prices and changed
manual positions pause execution for review.
Manual trading should use other symbols.
There is no real-money broker integration.

Durable order intent precedes the ledger call. A runner/bar/side-derived client
ID prevents duplicate orders; restart recovery reconciles committed intent
before evaluating prices. An expired uncommitted intent pauses for review.
One API instance remains required for process-local locks and scheduling.

Activity keeps the latest 100 evaluations/signals/orders/errors. State attributes
held quantity, entry price, realized P&L and closed trades to the pinned runner.
Pause holds positions; stop requires no held position or pending intent and
archives the runner. Reset archives the ledger and stops runners.

## Market data and account controls

Markets shows candles, saved-strategy indicator overlays, UTC timestamps,
watchlists and an accessible OHLCV table. Trading shows the latest-close basis
and timestamp. Database mode never substitutes synthetic data. Local seed mode
is visibly labeled.

The live adapter implements Alpaca stock daily and US crypto daily/hourly bars.
It uses fixed endpoints, bounded pagination/timeouts, completed-bar validation, provider guardrails, and no synthetic fallback. Equities refresh adjusted history;
crypto updates overlap recent bars. It requires credentials and permission to
use/display the selected feed. Reference contracts:
[stock bars](https://docs.alpaca.markets/us/reference/stockbars) and
[crypto bars](https://docs.alpaca.markets/us/reference/cryptobars-1).
No live-provider requests were made during implementation.

`npm --prefix apps/api run data:import -- <file> --validate-only` validates an
operator-supplied licensed JSON file without database access. The format is
`{provider,license_reference,series:[{symbol,name,asset_type,timeframe,bars}]}`;
each bar has UTC `timestamp`, numeric OHLC and nonnegative `volume` (equity volume must be an integer).

Supported timeframes are equity daily and USD crypto daily/hourly. Bars must be
ordered, unique, aligned, completed and sane.
The importer caps file size,
series and rows, applies one transaction, validates existing symbol metadata,
and logs only bounded counts/license metadata. Restart the API after import to clear caches.
Synthetic fixtures are not launch data.

Import bounds are 30 MiB, 100 series, 10,000 bars per series, and 100,000 bars total.
Prices must be positive and no greater than `1e12`; volume cannot exceed `Number.MAX_SAFE_INTEGER`.
Provider names contain 1–64 characters; license references contain 1–500 characters.
The transaction timeout is 120 seconds.

Security settings list hashed session/passkey identifiers, revoke owned
sessions, and enroll additional keys after a sign-in within five minutes.
Enrollment challenges bind user, session and purpose and are consumed once;
verification requires user verification and the configured RP/origin. Removing
the last key requires another linked sign-in method. Additional keys still need
real-browser HTTPS and MySQL restart verification before launch.

Account data offers an authenticated personal export, confirmed paper reset
with archive, and fresh-sign-in/email-confirmed account deletion. Reset retires
old client IDs so retried old orders cannot recreate trades. Deletion rejects
pending or running jobs and removes owned active-database records, invalidates sessions and
clears process caches. Shared market data is retained. Host logs, backup
retention and restoration handling require operator configuration. The public
help page describes these limits and offers repository-member feedback; public
support contact and final policy review remain launch prerequisites.

## Kernel and operations

`AI_DIFF_SUGGESTIONS_ENABLED` defaults false. When enabled, improvement responses
include optional `diff: {summary, changes: [{path, from, to, rationale}]}` with
at most five parameter-only previews: indicator period or stop/target
percentage, before/after and rationale. The original value must match and the
candidate complete definition must validate. The UI never applies suggestions
or submits orders. Stub mode validates the path without sending data externally;
live OpenAI verification and budget decisions remain optional setup work.

The scheduled production health workflow checks public liveness, database
readiness, freshness and provider degradation, with sanitized issue codes. It
skips when repository variable `PRODUCTION_API_BASE_URL` is absent. GitHub workflow-failure notifications need
an owner recipient. Database/AI host alerts, automated backups, restoration and
rollback drills remain external operational work.

## Verification

See the [testing strategy](requirements/Testing_Strategy.md#verification-evidence) for dated local results and outstanding hosted checks.
