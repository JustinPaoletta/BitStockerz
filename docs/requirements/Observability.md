# BitStockerz – Observability

## 1. Logging
Structured logs for:
- Backtest start / completion / failure
- Order placement and execution
- Market data ingestion errors
- AI invocation failures

## 2. Metrics
Track:
- Backtests per user per day
- Backtest duration
- Error counts per domain
- API request latency

## 3. Health Checks
- Liveness: API responding
- Readiness: DB reachable

## 4. Debugging
- Correlate logs via request IDs
- Backtest runs reference job IDs
