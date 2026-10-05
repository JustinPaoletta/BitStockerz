# BitStockerz API

NestJS API for BitStockerz (`apps/api`). Global prefix: `/api`. Default port: **4000**.

Use Node.js **24.21.0** from the root `.nvmrc`.
Browser OAuth/profile recovery merged in PR #13.
[October 4 extensions](../../docs/product/PRODUCT_EXTENSIONS.md) are local additions.
Hosting, final MySQL evidence, and real-provider production tests remain outstanding. See [deployment.md](../../docs/ops/deployment.md).

## Quick start

```bash
npm ci
cp .env.example .env   # optional — omit DATABASE_URL for in-memory seed mode
npm run start:dev
```

MySQL setup: [docs/database/Local_MySQL.md](../../docs/database/Local_MySQL.md)

## Commands

| Command                                              | Purpose                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run start:dev`                                  | Dev server with watch                                                                                |
| `npm run build`                                      | Production build                                                                                     |
| `npm run lint`                                       | ESLint                                                                                               |
| `npm run test`                                       | Unit tests                                                                                           |
| `npm run test:cov`                                   | Unit tests + **90%** global coverage gates                                                           |
| `npm run test:e2e`                                   | E2E suite (forces seed mode via `test/setup-e2e.ts`)                                                 |
| `npm run test:oauth`                                 | Native signed-provider token smoke (after build)                                                     |
| `npm run test:mysql:backtest` / `test:mysql:trading` | Isolated MySQL backtest/P&L round trips                                                              |
| `npm run test:mysql:security` / `test:mysql:auth`    | MySQL auth/quota and explicit-link/recovery regressions                                              |
| `npm run test:mysql:workspace`                       | Research, runner restart/idempotency, watchlist, reset, export, deletion, and enrollment persistence |
| `npm run data:import -- FILE --validate-only`        | Validate licensed JSON without database access                                                       |
| `npm run db:deploy`                                  | Apply Prisma migrations                                                                              |

## Configuration

Copy `.env.example` to `.env` (never commit `.env`). The server loads `.env` on startup via `src/load-env.ts`.

| Variable                                                                  | Notes                                                                                                                                                                                         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                | `development`, `test`, or `production` (default `development`).                                                                                                                               |
| `DATABASE_URL`                                                            | MySQL/MariaDB URL. Omit only for local/test seed mode; production requires active persistence.                                                                                                |
| `PORT`                                                                    | Listen port (default `4000`).                                                                                                                                                                 |
| `CORS_ALLOWED_ORIGINS`                                                    | Exact browser origins; defaults to `http://localhost:4200` outside production. Required in production.                                                                                        |
| `TRUSTED_PROXY_CIDRS`                                                     | Actual ingress IP/CIDR allowlist; empty trusts no proxy. Never trust all addresses.                                                                                                           |
| `READINESS_TIMEOUT_MS`                                                    | Per-dependency readiness timeout (default `1500`, range `100`–`30000`).                                                                                                                       |
| `LOG_LEVEL`                                                               | Pino level (default `info`).                                                                                                                                                                  |
| `LOG_TO_FILE` / `LOG_FILE_PATH`                                           | Optional file logging; a path alone also enables it.                                                                                                                                          |
| `INGESTION_SCHEDULER_ENABLED`                                             | Hourly ingestion and paper-runner scheduling. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` while manually testing ingestion. |
| `JOB_TIMEOUT_MS`                                                          | Job executor timeout (default `30000`).                                                                                                                                                       |
| `JOBS_SYSTEM_USER_ID`                                                     | User id for scheduled jobs (default `00000000-0000-4000-8000-000000000001`).                                                                                                                  |
| `MARKET_DATA_HEALTH_URL`                                                  | Optional readiness probe for `checks.marketData` (can point at `/api/market-data/health`).                                                                                                    |
| `MARKET_DATA_STALE_*_MS`                                                  | Health defaults: equity daily `172800000`, crypto daily `129600000`, crypto hourly `7200000` milliseconds.                                                                                    |
| `METRICS_ENABLED`                                                         | Toggle in-process `GET /api/metrics` (default `true`).                                                                                                                                        |
| `AUTH_SESSION_TTL_SECONDS`                                                | Bearer-session lifetime (default `43200`, maximum `604800`).                                                                                                                                  |
| `AUTH_CHALLENGE_TTL_SECONDS` / `AUTH_OAUTH_STATE_TTL_SECONDS`             | WebAuthn challenge and OAuth state lifetimes (defaults `300`).                                                                                                                                |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX_REQUESTS`              | WebAuthn/OAuth ceremony and dev email register/login rate limit (defaults `60000` / `30`).                                                                                                    |
| `AUTH_DEV_EMAIL_ENABLED`                                                  | Dev email register/login shortcuts (default `true` outside production; must be `false` in production).                                                                                        |
| `AUTH_LEGACY_WEBAUTHN_ENABLED`                                            | Legacy WebAuthn bypass for local automation (default `true` outside production; must be `false` in production).                                                                               |
| `ERROR_TEST_ENABLED`                                                      | Forced-error test routes (default `true` only when `NODE_ENV=test`; must be `false` in production).                                                                                           |
| `OPENAPI_ENABLED`                                                         | Swagger UI and OpenAPI JSON/YAML (default `true` outside production; default `false` in production).                                                                                          |
| `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` / `WEBAUTHN_ALLOWED_ORIGINS`        | WebAuthn relying-party settings. Production WebAuthn requires explicit allowed origins.                                                                                                       |
| `GOOGLE_OAUTH_*` / `APPLE_OAUTH_*`                                        | Optional provider configuration; all required values for an enabled provider must be set together.                                                                                            |
| `AUTH_OAUTH_BROWSER_CALLBACK_URL`                                         | Fixed SPA callback; set to its exact HTTPS URL for production browser login/linking.                                                                                                          |
| `BACKTEST_TIMEOUT_MS` / `BACKTEST_MAX_BARS` / `BACKTEST_MAX_SERIES_CELLS` | Engine execution and allocation limits (defaults `5000` / `10000` / `250000`).                                                                                                                |
| `BACKTEST_RATE_LIMIT_WINDOW_MS` / `BACKTEST_RATE_LIMIT_MAX_REQUESTS`      | Per-user backtest-create rate limit (defaults `60000` / `10`).                                                                                                                                |

| `PAPER_STARTING_BALANCE` | Initial/reset USD balance; default `100000.00`. |
| `TRADING_MAX_ORDER_NOTIONAL` | Maximum unrounded order notional; default `25000`. |
| `TRADING_MAX_POSITION_PCT` | Maximum resulting single-symbol percentage of pre-trade equity for buys; default `25`. |
| `TRADING_MIN_CASH_REMAINING` | Minimum cash after a buy using rounded notional; default `0`. |
| `CACHE_ENABLED` | Process-local cache; default `true`. |
| `CACHE_CANDLES_TTL_MS` / `CACHE_SYMBOLS_TTL_MS` | Default `60000` each; range `1000`–`3600000` milliseconds. |
| `CACHE_MAX_ENTRIES` | Default `500`; range `10`–`100000`. |
| `MARKET_DATA_LIVE_ENABLED` | Enable vendor ingestion; default `false`. |
| `MARKET_DATA_CIRCUIT_FAILURES` / `MARKET_DATA_CIRCUIT_COOLDOWN_MS` | Default `3` failures / `60000` milliseconds. |
| `ALPACA_API_KEY` / `ALPACA_SECRET_KEY` | Host credentials for the implemented historical adapter. |
| `ALPACA_EQUITY_FEED` | `sip` selects SIP; other values select `iex`. Confirm entitlement and data rights. |
| `AI_ENABLED` | Default `false`. |
| `AI_PROVIDER` | `stub` or `openai`. Tests default to `stub`; other environments default to `openai`. The example file explicitly selects `stub`. |
| `AI_MODEL` / `OPENAI_API_KEY` | Both required when live AI is enabled. The disabled/stub model default is `gpt-4.1-mini`. |
| `AI_DAILY_CALL_LIMIT` | Default `20`; range `1`–`1000` per user per UTC day. |
| `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` | Default `15000` milliseconds / `1`; ranges `1000`–`60000` / `0`–`3`. |
| `AI_MAX_OUTPUT_TOKENS` / `AI_MAX_CONTEXT_CHARS` | Default `1200` / `12000`; ranges `1`–`4000` / `1000`–`50000`. |
| `AI_LOG_CONTENT` | Default `false`; must remain false in production. |
| `AI_DIFF_SUGGESTIONS_ENABLED` | Parameter previews; default `false`. |

Manual job/ingestion POSTs require a bearer session and are allowed only in
development/test; production returns 403. Profile/recovery uses explicit
authenticated provider linking, never email-only account ownership.

## Licensed import

The JSON format and limits are described in [product extensions](../../docs/product/PRODUCT_EXTENSIONS.md#market-data-and-account-controls).
The following example shows the input format; it does not establish data rights.
Replace provider, license, symbol, and bar values with licensed source data.

```json
{
  "provider": "YOUR_PROVIDER",
  "license_reference": "YOUR_LICENSE_REFERENCE",
  "series": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "asset_type": "EQUITY",
      "timeframe": "1d",
      "bars": [
        {
          "timestamp": "2026-01-02T00:00:00Z",
          "open": 100,
          "high": 102,
          "low": 99,
          "close": 101,
          "volume": 1000
        }
      ]
    }
  ]
}
```

From the repository root, validate a licensed file:

```sh
npm --prefix apps/api run data:import -- FILE --validate-only
```

To import after validation, run the same command without `--validate-only`.
The import loads `apps/api/.env` and requires `DATABASE_URL`.
Use the intended database; the operation updates matching symbols and bars.
Restart the API afterward to clear process-local caches.
The full MySQL import has not been verified locally.

## Verification

From repo root:

```bash
./scripts/sprint-delivery-verify.sh verify
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify   # smoke + MySQL persistence (loads apps/api/.env)
```

Manual curl tests: [docs/manual-testing/manual_testing.md](../../docs/manual-testing/manual_testing.md)

## Docs

When `OPENAPI_ENABLED=true` (default outside production):

- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON/YAML: `http://localhost:4000/api/openapi.json` and
  `http://localhost:4000/api/openapi.yaml`
- [API inventory](../../docs/database/API_Inventory.md)
- [Roadmap](../../docs/product/ROADMAP.md)
- [Root README](../../README.md)
