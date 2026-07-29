# BitStockerz MVP – 5) Backtesting (Stories)

This document defines the epics and user stories for the **Backtesting** module of the BitStockerz MVP.

Scope:
- Run a single strategy on a single symbol
- Use historical market data (daily or hourly)
- Simulate long-only trades
- Persist results, trades, and equity curves
- Display performance metrics and charts

Dependencies:
- #2 Market Data
- #4 Strategy Lab

## Status

- Completed in Sprint 3.1 (July 28, 2026): #5.2.1–#5.2.5.
- Completed locally in Sprint 3.2 (July 28, 2026): #5.1.1–#5.1.3
  and #5.6.1; included in draft PR #9.
- Completed locally in Sprint 3.3 (July 28, 2026): #5.3.1–#5.3.3 and
  #5.5.1–#5.5.2; included in draft PR #9.
- Completed locally in Sprint 3.4 (July 28, 2026): #5.4.1–#5.4.2 and the thin
  Angular scaffold needed to demo them; included in draft PR #9.

---

## Epic 5.1 – Backtest Run Model & Persistence

### Story 5.1.1 – Backtest run schema
Acceptance criteria:
- Prisma and MySQL store owner, strategy, immutable strategy-version, symbol,
  timeframe, inclusive date range, fixed-scale initial equity, optional job,
  bounded error, and lifecycle timestamps.
- Status transitions are compare-and-set and owner-scoped:
  `pending → running → completed|failed|timed_out`; terminal rows cannot be
  rewritten and wrong-owner access behaves as not found.
- The jobs foreign key is nullable with `ON DELETE SET NULL`; user, strategy,
  strategy-version, and symbol parents use `ON DELETE RESTRICT`.
- The same internal service contract works in seed mode with copy-on-write
  records and isolated read results.
- Run creation rejects inactive/unknown or strategy-asset-incompatible symbols,
  unsupported symbol/timeframe combinations, sub-cent initial equity, and
  optional job links not owned by the run owner in both database modes.
- Owner-scoped reads and lifecycle writes first reattach the current
  process-local auth id so completed history remains visible after restart.

### Story 5.1.2 – Backtest result storage
Acceptance criteria:
- A completed run has exactly one result row containing fixed-scale equity,
  return, drawdown, win-rate, average win/loss, nullable Sharpe, and integer
  trade count.
- Completion changes run state and writes the result plus all dependent rows in
  one Prisma transaction; seed mode swaps one fully cloned aggregate.
- Failed and timed-out runs store a catalog-safe bounded error on the run and
  have no result, trade, or equity rows.
- Engine-output decimals are rounded half-up and range-checked against their
  target columns; initial equity must already be cent-exact. Values are
  returned internally as fixed-scale strings.

### Story 5.1.3 – Trades & equity curve storage
Acceptance criteria:
- Closed long trades persist symbol, ordered entry/exit times, fixed-scale
  prices/quantity/P&L, and cascade when an admin deletes the owning run.
- Equity points persist in strictly ascending time order with fixed-scale
  non-negative equity and cascade with the run.
- Prisma writes use batches of at most 500 dependent rows and reads are stable
  by timestamp plus row id.
- The persistence boundary rejects malformed, unsorted, mismatched-symbol,
  non-finite, or internally inconsistent engine output before any dependent
  data is committed.
- First/last curve equity must match the run's initial equity/result final
  equity, trade P&L must match price/quantity, and every persisted summary
  metric is recomputed from the fixed-scale rows after the raw supplied summary
  is validated exactly against the raw trades/equity curve.

---

## Epic 5.2 – Backtest Engine Core

### Story 5.2.1 – Engine interface
Acceptance criteria:
- A pure synchronous engine accepts a canonical Strategy Lab definition,
  strictly ascending finite OHLCV bars, positive initial equity, optional
  symbol id/cancellation, and bounded execution limits.
- Output contains closed long trades, exactly one equity point per processed
  bar, summary metrics, and bounded diagnostics.
- Empty/short, malformed, duplicate-timestamp, and unsorted bar inputs fail
  closed with stable `BACKTEST_*` domain codes.
- Identical definitions and bars produce identical trades, curves, and metrics;
  only measured diagnostic duration may vary.

### Story 5.2.2 – Indicator computation layer
Acceptance criteria:
- Pure aligned series support SMA, EMA, and Wilder RSI with null warmup values
  and the Strategy Lab source restrictions.
- EMA seeds from the first period SMA. RSI requires one initial change window;
  flat windows resolve to 50 and zero-loss/zero-gain windows resolve to 100/0.
- Invalid periods, types, sources, ids, and duplicate ids fail closed.

### Story 5.2.3 – Rule evaluation
Acceptance criteria:
- AND-only groups support `gt`, `gte`, `lt`, `lte`, relative-epsilon `eq`,
  `crosses_above`, and `crosses_below`.
- Operands resolve indicator ids, OHLC prices, or finite `literal` values.
- Crosses use current and previous values, return false through null warmup, and
  require at least one dynamic operand.

### Story 5.2.4 – Trade simulation logic
Acceptance criteria:
- Simulation is single-symbol, long-only, one position maximum, and invests
  100% of current equity with zero fees/slippage.
- Signals fill at the signal-bar close. An open final position force-closes at
  the last close; an exit never re-enters on that same bar.
- Equity is marked to market once per bar. Trade percentages use percentage
  points; average loss remains negative and max drawdown is a positive
  magnitude.
- Metrics include return, drawdown, win rate, trade count, average win/loss,
  and non-annualized per-bar Sharpe (`null` when undefined).

### Story 5.2.5 – Stop loss / take profit handling
Acceptance criteria:
- Percent stop loss and take profit use intrabar low/high beginning on the bar
  after entry and fill at their exact threshold.
- Risk exits run before signal exits. If a bar touches both thresholds, stop
  loss wins; no same-bar re-entry occurs.
- Persisted definitions support the Strategy Lab 500% take-profit ceiling;
  absent legacy risk fields are skipped defensively.

---

## Epic 5.3 – Backtest Execution APIs

### Story 5.3.1 – Run backtest
Acceptance criteria:
- Authenticated `POST /api/backtests` validates the owned active strategy,
  immutable version pin, symbol/timeframe, strict inclusive date range, and
  cent-exact positive initial equity.
- It creates a linked `backtest_run` job, executes synchronously through the
  jobs executor, loads real seed/Prisma bars, persists terminal output, and
  returns `200 { run, results }` without the full curve/trades payload.
- Known validation, bar/resource, timeout, and state failures retain stable
  `BACKTEST_*` RFC 7807 codes and leave no orphaned dependent result rows.

### Story 5.3.2 – List backtest runs
Acceptance criteria:
- Authenticated owner-only list supports strategy, normalized symbol, status,
  limit, and offset filters with `created_at DESC, id ASC` ordering.
- Items contain summary metrics and strategy/symbol display data but omit the
  full trades and equity curve.

### Story 5.3.3 – Backtest detail view
Acceptance criteria:
- Authenticated owner-only detail returns run metadata, nullable results,
  stable-id paged trades, `trades_page`, and the complete ordered equity curve.
- Invalid ids fail validation; missing and cross-owner ids both return
  `BACKTEST_NOT_FOUND`.

---

## Epic 5.4 – Backtest Results UI

### Story 5.4.1 – Equity curve chart
Acceptance criteria:
- Angular renders the complete API equity curve with real time/equity axes,
  loading, failure, empty, and responsive states.
- Decimal strings are converted to finite chart numbers only at the client
  mapper boundary and the chart instance is disposed on teardown.

### Story 5.4.2 – Trades table
Acceptance criteria:
- A semantic table renders entry/exit, price, quantity, absolute/percentage
  P&L, and positive/negative styling from API rows.
- “Load more” follows `trades_page.has_more`, advances by loaded row count, and
  de-duplicates by stable trade id.

---

## Epic 5.5 – Performance & Limits

### Story 5.5.1 – Bar count limits
Acceptance criteria:
- A conservative date-span precheck rejects obviously oversized requests and
  the job handler independently enforces the actual loaded-row limit.
- Indicator series allocation remains subject to the engine series-cell cap.

### Story 5.5.2 – Logging & diagnostics
Acceptance criteria:
- Bounded response/job diagnostics include counts and duration without full
  strategies, bars, trades, or curves.
- Metrics classify completed, failed, and timed-out backtests; structured logs
  and audit metadata contain identifiers and bounded summaries only.

---

## Epic 5.6 – Reproducibility

### Story 5.6.1 – Strategy version pinning
Acceptance criteria:
- Every run stores both its owned strategy id and a non-null immutable
  `strategy_versions.id`.
- Omitting an explicit version id pins the latest version; supplying one
  requires that exact version to belong to the active owned strategy.
- Latest-version runs enforce the strategy's current timeframe. Explicit
  internal historical pins persist the caller's valid timeframe so definition
  replay remains possible after current metadata changes; compatible symbol
  asset type and supported market-data timeframe are still required.
- Creating later strategy versions never changes an existing run's pin.
- Pin resolution is internal and owner-scoped; database version ids are not
  added to the existing Strategy Lab HTTP response.
