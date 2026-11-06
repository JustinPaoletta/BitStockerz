# BitStockerz – Non-Functional Requirements (NFRs)

These are engineering targets, not measured production guarantees.
The [deployment runbook](../../ops/deployment.md) records the app-only target and dated provider setup.
The [app delivery plan](../../../APP_ONLY_PLAN.md) defines iPhone acceptance and release gates.
The backtest fixture has automated timing coverage.
End-to-end latency and data freshness still require deployment and vendor verification.

## 1. Performance

- Backtest (1 year daily bars): < 2 seconds (single symbol)
- Dashboard load (cached data): < 500ms
- API P95 latency: < 300ms (non-backtest endpoints)
- Hot candle/symbol reads use an in-process TTL cache (Sprint 7.1; default 60s)
  to reduce repeat load while staying within freshness targets above.

## 2. Availability

- MVP target: best-effort availability
- No strict SLA, graceful recovery expected
- Initial app mutations require network access. Do not queue orders or backtests offline without a separate reconciliation design.
- Measure device startup, chart interaction, memory, and network recovery on the physical iPhone before setting additional device-specific thresholds.
- Keep the existing API performance targets above; they are separate from device interaction measurements.

## 3. Data Freshness

- Equity daily data: updated once per trading day
- Crypto hourly target: delay < 1 hour. Current health marks data stale after 2 hours by default.

## 4. Scalability (Explicit Non-Goals)

- No horizontal scaling guarantees for MVP
- Single-region deployment acceptable
- In-process cache assumes Option A always-on single API replica (see
  `docs/ops/deployment.md`)

Production latency and freshness targets remain unmeasured. Operator thresholds must account for market closures.
