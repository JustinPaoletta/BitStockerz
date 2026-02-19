# BitStockerz – Observability

## 1. Logging
Structured JSON logs (Pino) to stdout.

Optional local file logging (API):
- `LOG_TO_FILE=true` writes logs to `logs/api.log`
- `LOG_FILE_PATH=/absolute/or/relative/path.log` writes logs to a custom file

Baseline request log fields:
- level, time, msg
- requestId (custom) and reqId (pino)
- req.method, req.url
- res.statusCode
- responseTime (ms)
- correlation header: x-request-id echoed to clients

Redaction:
- req.headers.authorization
- req.headers.cookie

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
