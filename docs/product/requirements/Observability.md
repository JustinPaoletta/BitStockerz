# BitStockerz – Observability

## 1. Logging
Structured JSON logs (Pino) to stdout.

Optional local file logging (API):
- `LOG_TO_FILE=true` writes logs to `logs/api.log` (or `LOG_FILE_PATH` when set)
- Setting `LOG_FILE_PATH` alone also enables file logging to that path
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

Structured logs for (as domains ship):
- Market data ingestion errors (jobs / ingestion handlers)
- Backtest start / completion / failure (planned)
- Order placement and execution (planned)
- AI invocation failures (planned)

## 2. Metrics
Track (targets; Sprint 1.4+ / domain sprints):
- Backtests per user per day
- Backtest duration
- Error counts per domain
- API request latency

## 3. Health Checks
- Liveness: `GET /api/health/live` returns `{ status: "ok" }`
- Readiness: `GET /api/health/ready` returns `ready`, `status`, `timestamp`, and `checks.database` / `checks.marketData` as objects `{ status, latencyMs?, details? }` where `status` is `up` | `down` | `not_configured`. Returns HTTP 503 when `ready` is `false`.

## 4. Debugging
- Correlate logs via request IDs
- Backtest runs reference job IDs (planned with backtesting)
