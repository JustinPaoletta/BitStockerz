# BitStockerz – Non-Functional Requirements (NFRs)

## 1. Performance
- Backtest (1 year daily bars): < 2 seconds (single symbol)
- Dashboard load (cached data): < 500ms
- API P95 latency: < 300ms (non-backtest endpoints)
- Hot candle/symbol reads use an in-process TTL cache (Sprint 7.1; default 60s)
  to reduce repeat load while staying within freshness targets above.

## 2. Availability
- MVP target: best-effort availability
- No strict SLA, graceful recovery expected

## 3. Data Freshness
- Equity daily data: updated once per trading day
- Crypto hourly data: delay < 1 hour acceptable

## 4. Scalability (Explicit Non-Goals)
- No horizontal scaling guarantees for MVP
- Single-region deployment acceptable
- In-process cache assumes Option A always-on single API replica (see
  `docs/ops/deployment.md`)
