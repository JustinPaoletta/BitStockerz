# BitStockerz API – Manual Testing Guide

Use this guide to smoke-test the runnable API in `apps/api` and the Angular app
in `apps/web` after local changes. All API paths below are prefixed with `/api`
and assume port **4000** (override with `PORT`). The Angular app runs on port
**4200**.

## How to use this guide

Use two terminals:

- **Terminal A — API:** start and stop the API here. Run only one API process on port `4000`.
- **Terminal B — tests:** run curls here. Variables such as `TOKEN`, `STRATEGY_EMAIL`, and `STRATEGY_ID` remain available when Terminal A restarts.

Choose the smallest relevant test set:

| Change area | Required manual sections |
| --- | --- |
| Any API change | Sections 1–2 |
| Symbols or candle reads | Sections 3–7 |
| Jobs, ingestion, or market-data persistence | Sections 8–10 in MySQL mode |
| Observability or audit | Section 10 |
| Strategy CRUD/versioning/validation or backtest APIs | Sections 11 (and 3.4 UI paths in Section 13 when touching Angular) |
| Paper accounts, orders, executions, positions, pricing/risk, or portfolio views | Section 12 in both seed and MySQL modes |
| Angular shell, passkeys, dashboard widgets, Strategy Lab, or Trade desk | Section 13 (`npm --prefix apps/web run e2e` for the automated seed path) |
| Full release/sprint verification | Run both automated verifier commands in Section 0 |

Prerequisites: Node.js `24.11.1`, npm, `curl`, and `jq`. Docker Desktop is additionally required for MySQL-mode tests.

## Section 0 – Local setup

Run all setup commands from the repository root.

### Install dependencies

```bash
npm ci
npm --prefix apps/api ci
npm --prefix apps/web ci
```

### Start in seed mode — Terminal A

Use an explicitly empty `DATABASE_URL` so an existing `apps/api/.env` cannot silently switch the API to MySQL:

```bash
DATABASE_URL= INGESTION_SCHEDULER_ENABLED=false \
  npm --prefix apps/api run start:dev
```

Expected startup target: `http://localhost:4000/api`. Leave this process running while using Terminal B.

### Start in MySQL mode — Terminal A

Full Docker setup: [docs/database/Local_MySQL.md](../database/Local_MySQL.md)

```bash
./scripts/docker-mysql.sh start
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
# Ensure DATABASE_URL is set in apps/api/.env
npm --prefix apps/api run db:deploy
INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
```

Expected: migrations apply successfully and `/api/health/ready` reports the database as `up`. The inline scheduler override prevents hourly ingestion from interfering with Section 8.

### Database modes

| Mode | When | Behavior |
| --- | --- | --- |
| **In-memory** | No `DATABASE_URL` | Auth (users, sessions, passkeys), symbols, candles, jobs, strategies, backtests, paper trading, metrics, and audit events live in process. Data resets on API restart. |
| **MySQL** | `DATABASE_URL` set + migrations applied | Jobs, ingested bars, audit events, strategies/versions, backtests, and paper accounts/orders/executions/positions persist. Symbol/candle reads use DB rows (empty until ingestion). Auth sessions/passkeys remain in-memory; persisted ownership remaps a minimal `users` row across restarts. |

### Automated alternative

Stop any API already running in Terminal A before using this path; the verifier starts its own API and intentionally refuses to take over an occupied port `4000`.

From the repository root:

```bash
# Seed mode: API/web build + lint + unit + coverage/e2e + audit + HTTP smoke
./scripts/sprint-delivery-verify.sh verify

# MySQL mode: the same gates + migrations + persistence + ingestion + restart checks
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify
```

Each command must exit with status `0`, with every gate marked `GATE PASS` and
the smoke summary reporting `0 failed`. The verifier includes web build, lint,
unit, and audit gates plus a real Sprint 3.3 HTTP run/list/detail smoke flow.
Default `verify` clears `DATABASE_URL` for its smoke API even when
`apps/api/.env` defines one. The MySQL command loads `DATABASE_URL` from
`apps/api/.env`, deploys migrations, verifies a transactional
backtest and paper-trading persistence round trips, ingests the current rolling
fixture window, and verifies strategy ownership after an API restart.

Standalone smoke tests require an API already running on port `4000`. Match the assertion mode to the API you started:

```bash
# Seed-backed API:
DATABASE_URL= ./scripts/smoke-test-api.sh --sprint all

# MySQL-backed API: safely load only DATABASE_URL first:
source scripts/lib/load-api-env.sh
load_database_url_from_api_env "$PWD/apps/api"
./scripts/smoke-test-api.sh --sprint all
```

The standalone smoke script does not load `.env`; it honors an already-exported `DATABASE_URL` so its assertions match the API mode you actually started. The verify script loads `DATABASE_URL` from `apps/api/.env` only when `KEEP_DATABASE_URL=1`.

Authenticated bearer token required for job, ingestion, and strategy endpoints.

Generated API reference while the server is running:

- Swagger UI: `http://localhost:4000/api/docs`
- OpenAPI JSON: `http://localhost:4000/api/openapi.json`
- OpenAPI YAML: `http://localhost:4000/api/openapi.yaml`

---

## Section 1 – Health & readiness (Sprint 0.1)

```bash
curl -s http://localhost:4000/api/health/live | jq
```

Expected: `{ "status": "ok" }`

```bash
curl -s http://localhost:4000/api/health/ready | jq
```

Expected: `ready: true`, `status: "ok"`, and:

```json
{
  "ready": true,
  "status": "ok",
  "checks": {
    "database": { "status": "not_configured" },
    "marketData": { "status": "not_configured" }
  }
}
```

- **Without `DATABASE_URL`:** `checks.database.status` is `not_configured`.
- **With MySQL:** `checks.database.status` is `up` with `latencyMs`.
- **`checks.marketData`:** `not_configured` unless `MARKET_DATA_HEALTH_URL` is set (optional readiness probe; often pointed at `http://localhost:4000/api/market-data/health` after Sprint 1.4).

---

## Section 2 – Auth shortcuts (Sprint 0.2)

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"manual@example.com","display_name":"Manual Tester"}' | jq
```

Expected: `201` with `access_token`, `token_type: "Bearer"`, and a `user` object.

```bash
curl -s http://localhost:4000/api/me \
  -H "Authorization: Bearer <access_token>" | jq
```

Expected: `200` with the registered profile.

---

## Section 3 – Symbol lookup (Sprint 1.1)

```bash
curl -s http://localhost:4000/api/symbols/AAPL | jq
```

Expected: `200` with `symbol: "AAPL"`, `asset_type: "EQUITY"`, `is_active: true`.

```bash
curl -s http://localhost:4000/api/symbols/NOPE | jq
```

Expected: `404` RFC 7807 problem with `code: "NOT_FOUND"`.

---

## Section 4 – Symbol search (Sprint 1.1)

```bash
curl -s 'http://localhost:4000/api/symbols/search?q=usd&asset_type=CRYPTO&limit=5' | jq
```

Expected: `200` array including `BTC-USD` and `ETH-USD`.

---

## Section 5 – Equity daily candles (Sprint 1.2)

Public endpoint: `GET /api/market-data/equities/candles`

### Seed symbols with candle data (no `DATABASE_URL`)

| Symbol | Seed bars | Approximate range |
| --- | --- | --- |
| `AAPL` | 40 weekday daily bars | rolling window ending **today (UTC)** |
| `MSFT` | 40 weekday daily bars | same generator pattern |
| `SPY` | 40 weekday daily bars | same generator pattern |

### Success – default ascending order

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=aapl&start=2000-01-01&end=2099-12-31' | jq 'length'
```

Expected: `200` with `40` bars ordered by `date`, each with numeric OHLCV and `date` as `YYYY-MM-DD`.

### Success – descending order with limit

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&order=desc&limit=2' | jq
```

Expected: `200` with two rows; newest `date` first.

### Success – empty range

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=1990-01-01&end=1990-01-31' | jq
```

Expected: `200` with `[]`.

### Validation – wrong asset type

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=BTC-USD&start=2000-01-01&end=2099-12-31' | jq
```

Expected: `400` with `code: "VALIDATION_ERROR"` and `fieldErrors`.

### Not found

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=NOPE&start=2000-01-01&end=2099-12-31' | jq
```

Expected: `404` with `code: "NOT_FOUND"`.

---

## Section 6 – Crypto candles (Sprint 1.2)

Public endpoint: `GET /api/market-data/crypto/candles`

### Seed symbols with candle data (no `DATABASE_URL`)

| Symbol | Daily (`interval=1d`) | Hourly (`interval=1h`) |
| --- | --- | --- |
| `BTC-USD` | 30 daily bars ending today (UTC) | 48 hourly bars ending at the current UTC hour |
| `ETH-USD` | same | same |

### Success – crypto daily

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=btc-usd&interval=1d&start=2000-01-01&end=2099-12-31' | jq 'length'
```

Expected: `200` with `30` objects using `date` (not `timestamp`) and numeric OHLCV fields.

### Success – crypto hourly

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2000-01-01T00:00:00.000Z&end=2099-12-31T23:59:59.999Z' | jq 'length'
```

Expected: `200` with `48` objects using UTC `timestamp` ISO strings.

### Validation – equity symbol on crypto endpoint

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=AAPL&interval=1d&start=2000-01-01&end=2099-12-31' | jq
```

Expected: `400` `VALIDATION_ERROR`.

### Validation – hourly range without timezone

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2026-01-15T00:00:00&end=2026-01-15T02:00:00.000Z' | jq
```

Expected: `400` `VALIDATION_ERROR` on `start`.

---

## Section 7 – Candle endpoint regression checklist

Run this checklist after Sprint 1.2 changes or before marking the sprint complete.

| # | Scenario | Command | Expect |
| --- | --- | --- | --- |
| 1 | Equity happy path | Section 5 ascending `AAPL` curl | `200`, 40 bars, ascending dates |
| 2 | Equity `order` + `limit` | Section 5 descending curl | `200`, 2 bars, newest first |
| 3 | Equity empty range | Section 5 empty-range curl | `200`, `[]` |
| 4 | Equity wrong asset | Section 5 `BTC-USD` curl | `400`, `VALIDATION_ERROR` |
| 5 | Crypto daily happy path | Section 6 daily curl | `200`, 30 bars with `date` |
| 6 | Crypto hourly happy path | Section 6 hourly curl | `200`, 48 bars with `timestamp` |
| 7 | Crypto wrong asset | Section 6 `AAPL` curl | `400`, `VALIDATION_ERROR` |
| 8 | Unknown symbol | Section 5 `NOPE` curl | `404`, `NOT_FOUND` |
| 9 | Reversed equity range | `curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-02-01&end=2026-01-01'` | `400`, `VALIDATION_ERROR` |
| 10 | Invalid limit | `curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31&limit=0'` | `400`, `VALIDATION_ERROR` |

With `DATABASE_URL` configured and empty bar tables, run Section 8 ingestion curls first, then repeat rows 1, 2, 5, and 6; expect non-empty candle arrays for seeded symbols.

---

## Section 8 – Jobs and ingestion (Sprint 1.3)

Register and capture a bearer token:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"ingestion-manual@example.com","display_name":"Ingestion Manual"}' \
  | jq -r '.access_token')
```

### Success – equity import (single symbol)

```bash
curl -s -X POST http://localhost:4000/api/market-data/ingestion/equity \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL"}' | jq
```

Expected: `201` job with `job_type: equity_daily_import`, `status: completed`, `payload.imported_equity_bars: 40`.

### Success – crypto import (daily + hourly)

```bash
curl -s -X POST http://localhost:4000/api/market-data/ingestion/crypto \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC-USD","intervals":["1d","1h"]}' | jq
```

Expected: `201` with `imported_crypto_daily_bars: 30` and `imported_crypto_hourly_bars: 48`.

### Success – fetch job by id

```bash
JOB_ID=$(curl -s -X POST http://localhost:4000/api/jobs \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"job_type":"equity_daily_import"}' | jq -r '.id')

curl -s http://localhost:4000/api/jobs/$JOB_ID \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `200` with matching `id` and `status: completed`.

### Validation – unauthenticated job request

```bash
curl -s -X POST http://localhost:4000/api/jobs \
  -H 'Content-Type: application/json' \
  -d '{"job_type":"equity_daily_import"}' | jq
```

Expected: `401` `UNAUTHORIZED`.

### Ingestion regression checklist

| # | Scenario | Expect |
| --- | --- | --- |
| 1 | Equity import `AAPL` | `completed`, 40 bars in payload |
| 2 | Crypto import `BTC-USD` both intervals | `completed`, 30 daily + 48 hourly |
| 3 | `GET /jobs/:id` as owner | `200`, same job id |
| 4 | Unauthenticated `POST /jobs` | `401` |

---

## Section 9 – MySQL persistence checklist (Sprint 1.2 + 1.3)

Run after Section 0 MySQL setup. On a **fresh migrated database**, symbol and bar tables are empty — run **Section 8 ingestion first** (it upserts symbols and OHLCV bars).

### 9.1 Confirm database is up

```bash
curl -s http://localhost:4000/api/health/ready | jq '.checks.database'
```

Expected: `"status": "up"`.

### 9.2 Fresh DB — symbols and candles absent (optional)

```bash
curl -s http://localhost:4000/api/symbols/AAPL | jq '.code'
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31' | jq '.code'
```

Expected on a **fresh migrated DB (before ingestion):** `NOT_FOUND` for both (no seed fallback when Prisma is enabled).

### 9.3 Run ingestion (Section 8)

Complete Section 8 equity and crypto import curls with a bearer token.

### 9.4 Symbols and candles after ingestion

```bash
curl -s http://localhost:4000/api/symbols/AAPL | jq '.symbol'
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2000-01-01&end=2099-12-31' | jq 'length'
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1d&start=2000-01-01&end=2099-12-31' | jq 'length'
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2000-01-01T00:00:00.000Z&end=2099-12-31T23:59:59.999Z' | jq 'length'
```

Expected: `"AAPL"`, then **at least** `40`, `30`, and `48` respectively. Ingestion upserts the current rolling fixture window but intentionally does not delete older rows, so a reused database can contain more than the seed-window counts.

### 9.5 Regression table (MySQL mode)

| # | Scenario | Expect |
| --- | --- | --- |
| 1 | `/health/ready` database check | `up` |
| 2 | Symbol/candles before ingestion (fresh DB) | `404 NOT_FOUND` |
| 3 | Section 8 equity + crypto import | `completed` jobs |
| 4 | Symbol lookup after ingestion | `200`, `AAPL` |
| 5 | Equity + crypto candles after ingestion | non-empty arrays |
| 6 | Restart API, re-fetch equity candles | same data (persisted) |

---

## Section 10 – Data health, metrics, and audit (Sprint 1.4)

### Prerequisites
- API on port `4000` with global prefix `/api`
- Seed mode (no `DATABASE_URL`) is fine for these curls
- Seed bars roll to **today (UTC)** on process start, so health should report `status: "ok"` and `stale: false` after a fresh restart (or after re-ingestion into MySQL)

### Success – market data health

```bash
curl -s http://localhost:4000/api/market-data/health | jq
```

Expected: `200` with `source` (`seed` or `database`), `series` (3 entries), `sanity.checked > 0`, and typically `status: "ok"`.

### Success – metrics snapshot

```bash
curl -s http://localhost:4000/api/health/live >/dev/null
curl -s http://localhost:4000/api/metrics | jq
```

Expected: `200` with `http.request_count >= 1`, plus `jobs` and `errors_by_domain`.

### Success – ingestion includes sanity + audit side effects

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"health@example.com","display_name":"Health"}' | jq -r .access_token)

curl -s -X POST http://localhost:4000/api/market-data/ingestion/equity \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL"}' | jq '.payload.sanity'
```

Expected: `sanity.checked` is 40 (AAPL seed bars) and `invalid` is 0.

### Success – inspect audit events (MySQL mode)

The audit log is not exposed over HTTP. With the default local Docker container running, inspect recent events directly:

```bash
docker exec bitstockerz-db sh -lc \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot "$MYSQL_DATABASE" -e \
  "SELECT event_type, user_id, JSON_KEYS(payload_json) AS payload_keys, created_at
   FROM audit_events
   ORDER BY id DESC
   LIMIT 10;"'
```

Expected: recent rows include events generated by your tests, such as `auth.register`, `market_data.ingestion_requested`, and later `strategy.created`. `payload_keys` must not include secret-bearing names such as `access_token`, `authorization`, `cookie`, `private_key`, or `client_secret`.

### Section 10 regression checklist

| # | Scenario | Command | Expect |
| --- | --- | --- | --- |
| 1 | Market data health | `GET /api/market-data/health` | `200`, has `series` + `sanity` |
| 2 | Metrics | `GET /api/metrics` | `200`, has `http` |
| 3 | Ingestion sanity | equity import `AAPL` | payload includes `sanity` |
| 4 | Auth still works with audit | register → logout | `201` / `201` |
| 5 | MySQL audit persistence | query `audit_events` | recent expected event types; no secrets |

---

## Section 11 – Strategy Lab (Sprints 2.1–2.3)

Register a unique test user and capture the bearer token:

```bash
STRATEGY_EMAIL="strategy-manual-$(date +%s)@example.com"
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STRATEGY_EMAIL\",\"display_name\":\"Strategy Manual\"}" \
  | jq -r '.access_token')

STRATEGY_DEFINITION=$(jq -cn '{
  indicators:[
    {id:"sma_fast",type:"SMA",params:{period:10},source:"close"},
    {id:"sma_slow",type:"EMA",params:{period:30},source:"close"}
  ],
  entry:{logic:"AND",conditions:[
    {left:{indicator:"sma_fast"},op:"crosses_above",right:{indicator:"sma_slow"}}
  ]},
  exit:{logic:"AND",conditions:[
    {left:{indicator:"sma_fast"},op:"crosses_below",right:{indicator:"sma_slow"}}
  ]},
  risk:{
    stop_loss:{type:"percent",value:2},
    take_profit:{type:"percent",value:500}
  }
}')
```

### Success – create strategy and immutable version 1

```bash
STRATEGY_HTTP_CODE=$(curl -s -o /tmp/bitstockerz-strategy-create.json \
  -w '%{http_code}' -X POST http://localhost:4000/api/strategies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$STRATEGY_DEFINITION" '{
    name:"  Manual Momentum  ",
    description:"Sprint 2.1–2.3 Strategy Lab regression check",
    asset_type:"CRYPTO",
    timeframe:"1h",
    definition:$definition
  }')")

echo "HTTP $STRATEGY_HTTP_CODE"
jq < /tmp/bitstockerz-strategy-create.json
STRATEGY_ID=$(jq -r '.id' /tmp/bitstockerz-strategy-create.json)
```

Expected: `201`; name is `Manual Momentum`, `symbol_scope` is `SINGLE`, `is_active` is `true`, `version_number` is `1`, and the definition round-trips unchanged.

### Success – read the owned strategy

```bash
curl -s "http://localhost:4000/api/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `200` with the same id, metadata, `version_number: 1`, and definition.

### Conflict – normalized duplicate name

```bash
curl -s -o /tmp/bitstockerz-strategy-duplicate.json -w '%{http_code}\n' \
  -X POST http://localhost:4000/api/strategies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$STRATEGY_DEFINITION" '{
    name:"manual momentum",asset_type:"CRYPTO",timeframe:"1d",definition:$definition
  }')"
jq < /tmp/bitstockerz-strategy-duplicate.json
```

Expected: `409` with `code: "CONFLICT"`.

### Validation and authentication boundaries

```bash
# Equity hourly is unsupported because equity candles are daily-only.
curl -s -X POST http://localhost:4000/api/strategies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$STRATEGY_DEFINITION" '{
    name:"Invalid Equity",asset_type:"EQUITY",timeframe:"1h",definition:$definition
  }')" | jq

# Missing bearer token.
curl -s -X POST http://localhost:4000/api/strategies \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$STRATEGY_DEFINITION" '{
    name:"Unauthenticated",asset_type:"CRYPTO",timeframe:"1d",definition:$definition
  }')" | jq
```

Expected: `400 VALIDATION_ERROR` for equity hourly and `401 UNAUTHORIZED` without a token.

Also verify strict text validation and UUID parsing:

```bash
# Numeric text fields must not be coerced into strings.
curl -s -X POST http://localhost:4000/api/strategies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --argjson definition "$STRATEGY_DEFINITION" '{
    name:123,description:456,asset_type:"CRYPTO",timeframe:"1h",definition:$definition
  }')" | jq

# Malformed ids are rejected before lookup.
curl -s http://localhost:4000/api/strategies/not-a-uuid \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: both return `400 VALIDATION_ERROR`.

### Ownership boundary

```bash
OTHER_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"strategy-other-$(date +%s)@example.com\",\"display_name\":\"Other User\"}" \
  | jq -r '.access_token')

curl -s "http://localhost:4000/api/strategies/$STRATEGY_ID" \
  -H "Authorization: Bearer $OTHER_TOKEN" | jq
```

Expected: `404 STRATEGY_NOT_FOUND`; the response does not reveal that another
user's strategy exists.

### Persistence check (MySQL mode)

This check requires the strategy above to have been created while the API was in MySQL mode.

1. In **Terminal A**, stop the API with `Ctrl+C`.
2. Restart it without changing `DATABASE_URL`:

   ```bash
   INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
   ```

3. In **Terminal B**, keep the existing `$STRATEGY_EMAIL` and `$STRATEGY_ID`, register the same email again, and read the original strategy:

   ```bash
   TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
     -H 'Content-Type: application/json' \
     -d "{\"email\":\"$STRATEGY_EMAIL\",\"display_name\":\"Strategy Manual Restart\"}" \
     | jq -r '.access_token')

   curl -s -o /tmp/bitstockerz-strategy-restart.json -w '%{http_code}\n' \
     "http://localhost:4000/api/strategies/$STRATEGY_ID" \
     -H "Authorization: Bearer $TOKEN"

   jq < /tmp/bitstockerz-strategy-restart.json
   ```

Expected: HTTP `200`, the same strategy id and definition, and `version_number: 1`. The read remaps the new in-memory user id to the persisted owner while retaining the strategy/version rows.

### Section 11 regression checklist

| # | Scenario | Expect |
| --- | --- | --- |
| 1 | Create valid crypto strategy | `201`, defaults `SINGLE`, version 1 |
| 2 | Read by owner | `200`, definition round-trips |
| 3 | Case-insensitive duplicate | `409 CONFLICT` |
| 4 | Equity + `1h` | `400 VALIDATION_ERROR` |
| 5 | Unauthenticated create | `401 UNAUTHORIZED` |
| 6 | Read by another user | `404 STRATEGY_NOT_FOUND` |
| 7 | Numeric name/description | `400 VALIDATION_ERROR`; no implicit string coercion |
| 8 | Malformed strategy id | `400 VALIDATION_ERROR` |
| 9 | Restart in MySQL mode and read again | `200`; persisted strategy/version remain available |

### Cleanup

```bash
rm -f /tmp/bitstockerz-strategy-duplicate.json \
  /tmp/bitstockerz-strategy-create.json \
  /tmp/bitstockerz-strategy-restart.json
```

Stop the API in Terminal A with `Ctrl+C`. The MySQL container may remain running for development; stop it with `./scripts/docker-mysql.sh stop` when desired.

---

## Section 12 – Paper trading (Sprints 4.1–4.3)

Run this section once with the seed-mode startup and once with the MySQL-mode
startup from Section 0. In MySQL mode, apply migrations first. Keep the same
Terminal B open for all commands in a run.

### 12.1 Register and verify account bootstrap

```bash
BASE_URL=http://localhost:4000/api
TRADING_EMAIL="trading-manual-$(date +%s)@example.com"
TOKEN=$(curl -s -X POST "$BASE_URL/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TRADING_EMAIL\",\"display_name\":\"Trading Manual\"}" \
  | jq -r '.access_token')

curl -s "$BASE_URL/paper-account" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-paper-account-before.json | jq

jq -e '
  .base_currency == "USD" and
  .starting_balance == "100000.00" and
  .cash_balance == "100000.00" and
  (.created_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"))
' /tmp/bitstockerz-paper-account-before.json
```

Expected: the final `jq` prints `true`. Repeating `GET /paper-account` returns
the same account id and does not create another account.

### 12.2 Ensure a current fill price exists

This is required in MySQL mode because symbol/candle reads do not fall back to
seed data. It is harmless and deterministic in seed mode.

```bash
curl -s -X POST "$BASE_URL/market-data/ingestion/equity" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL"}' \
  | jq -e '.status == "completed" and .payload.imported_equity_bars >= 40'
```

Expected: `true`.

### 12.3 Fill a BUY and prove idempotent replay

```bash
CLIENT_ORDER_ID="manual-buy-$(date +%s)"
BUY_BODY=$(jq -cn --arg client "$CLIENT_ORDER_ID" '{
  symbol:"AAPL",
  side:"BUY",
  quantity:"2.5",
  client_order_id:$client
}')

BUY_CODE=$(curl -s -o /tmp/bitstockerz-trading-buy.json \
  -w '%{http_code}' -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BUY_BODY")
BUY_ID=$(jq -r '.order.id' /tmp/bitstockerz-trading-buy.json)

REPLAY_CODE=$(curl -s -o /tmp/bitstockerz-trading-replay.json \
  -w '%{http_code}' -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$BUY_BODY")

test "$BUY_CODE" = 200
test "$REPLAY_CODE" = 200
jq -e '
  .order.status == "FILLED" and
  .order.symbol == "AAPL" and
  .order.side == "BUY" and
  .order.quantity == "2.50000000" and
  (.order.avg_fill_price | type) == "string" and
  (.order.filled_at | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"))
' /tmp/bitstockerz-trading-buy.json
jq -e --arg id "$BUY_ID" '.order.id == $id' \
  /tmp/bitstockerz-trading-replay.json
```

Expected: every assertion passes. There is one order and one execution for the
client id; the replay does not debit cash again.

### 12.4 Verify account, position, portfolio, and history views

```bash
curl -s "$BASE_URL/paper-account" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-paper-account-after.json | jq

jq -e --slurpfile before /tmp/bitstockerz-paper-account-before.json '
  (.cash_balance | tonumber) < ($before[0].cash_balance | tonumber)
' /tmp/bitstockerz-paper-account-after.json

curl -s "$BASE_URL/trading/positions" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-trading-positions.json | jq
jq -e '
  .positions == [{
    symbol:"AAPL",
    quantity:"2.50000000",
    avg_cost:.positions[0].avg_cost
  }] and (.positions[0].avg_cost | type) == "string"
' /tmp/bitstockerz-trading-positions.json

curl -s "$BASE_URL/trading/portfolio-summary" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-trading-summary.json | jq
jq -e '
  .total_equity == "100000.00" and
  .unrealized_pnl_total == "0.00" and
  ([.cash_balance,.total_position_value,.total_equity,.unrealized_pnl_total]
    | all(test("^-?[0-9]+\\.[0-9]{2}$")))
' /tmp/bitstockerz-trading-summary.json

curl -s "$BASE_URL/trading/orders?status=FILLED&symbol=AAPL&limit=1&offset=0" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-trading-orders.json | jq
jq -e --arg id "$BUY_ID" '
  .orders[0].id == $id and .limit == 1 and .offset == 0 and
  (.has_more | type) == "boolean"
' /tmp/bitstockerz-trading-orders.json

curl -s "$BASE_URL/trading/executions?symbol=AAPL&limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN" \
  | tee /tmp/bitstockerz-trading-executions.json | jq
jq -e '
  (.executions | length) == 1 and
  .executions[0].quantity == "2.50000000" and
  (.executions[0].price | test("^[0-9]+\\.[0-9]{8}$")) and
  (.executions[0].notional | test("^[0-9]+\\.[0-9]{2}$"))
' /tmp/bitstockerz-trading-executions.json
```

Expected: every assertion passes. The portfolio is flat to the same close used
for the fill; history ordering/pagination metadata is stable.

### 12.5 Persisted risk rejection and semantic conflict

```bash
RISK_CODE=$(curl -s -o /tmp/bitstockerz-trading-risk.json \
  -w '%{http_code}' -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL","side":"BUY","quantity":"9999","client_order_id":"manual-risk"}')
test "$RISK_CODE" = 200
jq -e '
  .order.status == "REJECTED" and
  .order.reject_reason == "MAX_ORDER_NOTIONAL" and
  (.order | has("filled_at") | not)
' /tmp/bitstockerz-trading-risk.json

CONFLICT_CODE=$(curl -s -o /tmp/bitstockerz-trading-conflict.json \
  -w '%{http_code}' -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(jq -cn --arg client "$CLIENT_ORDER_ID" '{
    symbol:"AAPL",side:"BUY",quantity:"3",client_order_id:$client
  }')")
test "$CONFLICT_CODE" = 409
jq -e '.code == "CONFLICT"' /tmp/bitstockerz-trading-conflict.json
```

Expected: the business risk failure is a persisted `200 REJECTED` order with
no execution. Reusing the original key for a different quantity is `409` and
does not create or fill another order.

### 12.6 SELL lifecycle and boundary failures

```bash
SELL_CODE=$(curl -s -o /tmp/bitstockerz-trading-sell.json \
  -w '%{http_code}' -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL","side":"SELL","quantity":"2.5","client_order_id":"manual-close"}')
test "$SELL_CODE" = 200
jq -e '.order.status == "FILLED"' /tmp/bitstockerz-trading-sell.json

curl -s "$BASE_URL/trading/positions" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -e '.positions == []'

# Long-only boundary: a new SELL has no position and persists a reject.
curl -s -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL","side":"SELL","quantity":"0.1"}' \
  | jq -e '.order.status == "REJECTED" and .order.reject_reason == "INSUFFICIENT_POSITION"'

# Quantity must be a JSON string, never a number.
curl -s -X POST "$BASE_URL/trading/orders" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"AAPL","side":"BUY","quantity":1}' \
  | jq -e '.code == "VALIDATION_ERROR" and .status == 400'

# Protected reads reject missing authentication.
curl -s "$BASE_URL/paper-account" \
  | jq -e '.code == "UNAUTHORIZED" and .status == 401'
```

Expected: the position disappears at zero; an excess SELL is persisted as a
business reject; invalid representation and missing auth use RFC 7807.

### 12.7 Real-MySQL transaction, race, and restart gate

With MySQL running, safely load the URL and execute the isolated test:

```bash
source scripts/lib/load-api-env.sh
load_database_url_from_api_env "$PWD/apps/api"

NODE_ENV=development \
INGESTION_SCHEDULER_ENABLED=false \
LOG_LEVEL=silent \
  npm --prefix apps/api run test:mysql:trading
```

Expected terminal line:

```text
Paper trading MySQL smoke PASS: provisioning, serializable fill, idempotency race, risk reject, full market-price range persistence, valuation, history, and restart ownership remap verified.
```

This gate creates isolated rows, sends two concurrent requests with the same
client id, and proves one execution. It also fills a fractional order at the
maximum `DECIMAL(18,6)` market-data price and verifies that `avg_cost`,
`avg_fill_price`, and execution `price` retain it in MySQL. Finally, it restarts
the Nest application context, re-registers the same email, proves the
account/cash/position/history survived the user-id remap, and removes its
fixtures.

### Section 12 regression checklist

| # | Scenario | Expect |
| --- | --- | --- |
| 1 | New signup → paper account | One account, USD, `100000.00` cash/start |
| 2 | BUY at current close | `200 FILLED`; one cash debit/position/execution |
| 3 | Same client id + payload | Original order id; no second execution/debit |
| 4 | Same client id + different payload | `409 CONFLICT`; no mutation |
| 5 | Oversized BUY | Persisted `200 REJECTED/MAX_ORDER_NOTIONAL` |
| 6 | Position/account/portfolio views | Fixed scales, stable shapes, owner-only |
| 7 | Orders/executions filters and paging | Stable newest-first result + metadata |
| 8 | SELL to zero | Cash credited; position removed |
| 9 | SELL without quantity held | Persisted `INSUFFICIENT_POSITION` reject |
| 10 | Numeric quantity / missing auth | `400 VALIDATION_ERROR` / `401 UNAUTHORIZED` |
| 11 | Seed automated smoke | `--sprint 4`: 15 passed, 0 failed |
| 12 | MySQL persistence gate | PASS including concurrent replay and restart remap |
| 13 | Maximum market-data price | Fractional fill persists in all trading price columns |

### Cleanup

```bash
rm -f /tmp/bitstockerz-paper-account-{before,after}.json \
  /tmp/bitstockerz-trading-{buy,replay,positions,summary,orders,executions,risk,conflict,sell}.json
```

Stop the API in Terminal A with `Ctrl+C`. Paper-trading rows created by the
manual HTTP flow intentionally remain in a local MySQL dev database as useful
history; the isolated MySQL gate cleans up its own fixtures.

## Section 13 – Angular Milestone 5 (Sprints 5.1–5.3)

Automated gates (seed mode; starts API + web):

```bash
npm --prefix apps/web test
npm --prefix apps/web run e2e
```

Terminal A (API, seed mode):

```bash
DATABASE_URL= INGESTION_SCHEDULER_ENABLED=false \
  WEBAUTHN_ALLOWED_ORIGINS=http://localhost:4200 \
  npm --prefix apps/api run start:dev
```

Terminal C (web):

```bash
npm --prefix apps/web start
```

Open `http://localhost:4200`.

### Pre-merge manual checklist

Work through these in order on a fresh browser session (or after Log out).

| # | What to do | Pass when |
| --- | --- | --- |
| 1 | **Register (email fallback)** — open Email fallback, register a new email + display name | Lands on `/dashboard`, primary nav + user label + Log out appear |
| 2 | **Shell** — click Dashboard / Trade / Strategies / Backtests; click logo | Each route loads; logo returns to dashboard |
| 3 | **Log out / returnUrl** — Log out, visit `/trade` (should bounce to login), sign in again | After login you land back on `/trade`, not a blank shell |
| 4 | **Session restore** — while signed in, hard-refresh `/dashboard` | Stay signed in; nav + widgets reload without re-login |
| 5 | **Dashboard widgets** — confirm Portfolio / Positions / Strategies / Backtests / Trades / Symbol search | Each widget has its own loading → ready/empty; one empty does not blank others |
| 6 | **Dashboard Edit link** — create a strategy first if needed, then from dashboard Strategies widget click **Edit** | Opens `/strategies/:id/edit`, not the detail page |
| 7 | **Symbol search** — on dashboard, type `AA`, arrow-key to AAPL, Enter | Combobox shows results; selection fills the field |
| 8 | **Strategy Lab create** — Strategies → Create → Validate → Save | “Definition is valid.” then detail page with name/version |
| 9 | **Strategy edit + dirty guard** — Edit, change name, click Back without saving | Browser confirm appears; Cancel keeps you on the editor |
| 10 | **Versioning** — Edit definition (e.g. period), Save, on detail switch Version dropdown | New version number; older version is read-only (no Edit/Delete) |
| 11 | **Backtest from strategy** — Detail → Run backtest; confirm strategy name + locked timeframe; pick dates covering seed AAPL (e.g. last ~3 months), Run | Navigates to detail with Equity curve + Final equity |
| 12 | **Trade BUY** — Trade desk, AAPL BUY qty `1`, Submit | Status “Filled BUY…”, cash drops, position + executions update |
| 13 | **Trade reject** — same ticket qty `9999`, Submit | Status shows `Rejected: MAX_ORDER_NOTIONAL` (or similar); order history shows REJECTED |
| 14 | **Trade SELL** — SELL qty equal to open AAPL position, Submit | Fills; position clears/reduces; cash increases |
| 15 | **SELL oversize client guard** — SELL more than displayed position | Inline error; no order submitted |
| 16 | **Passkey path (if device supports it)** — Log out, Register/Sign in with passkey | Session created; dashboard loads. If WebAuthn unavailable, email fallback still works |
| 17 | **401 handling** — DevTools → Application → Session Storage → delete `bs.access_token`, click Trade | Redirect to login; signing in restores access |

Optional stretch (not merge-blocking): force one dashboard API to fail in DevTools Network and confirm only that widget shows Retry.

---

## Section 14 – Kernel AI (Milestone 6 / Sprints 6.1–6.3)

Advisory Kernel endpoints. Stub mode needs no OpenAI key. `#6.4.2` diff suggestions remain deferred (`AI_DIFF_SUGGESTIONS_ENABLED=false`).

### Prerequisites

```bash
# API (seed mode is fine)
cd apps/api
cp -n .env.example .env   # if needed
# Enable stub Kernel for local manual tests:
# AI_ENABLED=true
# AI_PROVIDER=stub
# AI_MODEL=gpt-4.1-mini
# AI_DAILY_CALL_LIMIT=20
npm run start:dev

# Optional Angular UI
npm run web:start   # from repo root, typically :4200
```

### Env matrix

| Mode | Env | Expect |
|------|-----|--------|
| Disabled | `AI_ENABLED=false` | `503` `AI_DISABLED` |
| Stub (recommended local) | `AI_ENABLED=true` `AI_PROVIDER=stub` | Deterministic JSON, no network |
| Live OpenAI | `AI_ENABLED=true` `AI_PROVIDER=openai` `OPENAI_API_KEY=…` `AI_MODEL=gpt-4.1-mini` | Real model responses |

### Setup: register + strategy + backtest

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"kernel-manual@example.com"}' | jq -r .access_token)

STRATEGY=$(curl -s -X POST http://localhost:4000/api/strategies \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "name":"Kernel Manual",
    "asset_type":"EQUITY",
    "timeframe":"1d",
    "definition":{
      "indicators":[
        {"id":"fast","type":"SMA","params":{"period":2},"source":"close"},
        {"id":"unused","type":"EMA","params":{"period":30},"source":"close"}
      ],
      "entry":{"logic":"AND","conditions":[{"left":{"price":"close"},"op":"gt","right":{"literal":0}}]},
      "exit":{"logic":"AND","conditions":[{"left":{"price":"close"},"op":"lt","right":{"literal":0}}]},
      "risk":{"stop_loss":{"type":"percent","value":5},"take_profit":{"type":"percent","value":2}}
    }
  }')
STRATEGY_ID=$(echo "$STRATEGY" | jq -r .id)

BACKTEST=$(curl -s -X POST http://localhost:4000/api/backtests \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\",\"symbol\":\"AAPL\",\"timeframe\":\"1d\",\"start_date\":\"2024-01-02\",\"end_date\":\"2024-03-28\"}")
RUN_ID=$(echo "$BACKTEST" | jq -r .run.id)
```

### Success curls (stub)

```bash
curl -s -X POST http://localhost:4000/api/ai/explain-strategy \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}" | jq

curl -s -X POST http://localhost:4000/api/ai/validate-strategy \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}" | jq

curl -s -X POST http://localhost:4000/api/ai/explain-backtest \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"backtest_run_id\":\"$RUN_ID\"}" | jq

curl -s -X POST http://localhost:4000/api/ai/suggest-improvements \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\",\"backtest_run_id\":\"$RUN_ID\"}" | jq
```

Expect every success body to include `disclaimer`, `confidence`, and `ai_request_id`. Validate should include deterministic codes such as `UNREFERENCED_INDICATOR` and `RISK_REWARD_NOT_POSITIVE`.

### Error curls

```bash
# Disabled
# (restart API with AI_ENABLED=false)
curl -s -X POST http://localhost:4000/api/ai/explain-strategy \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}" | jq '{status:.status,code:.code}'
# expect 503 AI_DISABLED

# Ownership miss
OTHER=$(curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"kernel-other-manual@example.com"}' | jq -r .access_token)
curl -s -X POST http://localhost:4000/api/ai/explain-strategy \
  -H "Authorization: Bearer $OTHER" -H 'Content-Type: application/json' \
  -d "{\"strategy_id\":\"$STRATEGY_ID\"}" | jq '{status:.status,code:.code}'
# expect 404 STRATEGY_NOT_FOUND

# Bad UUID
curl -s -X POST http://localhost:4000/api/ai/explain-strategy \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"strategy_id":"not-a-uuid"}' | jq '{status:.status,code:.code}'
# expect 400 VALIDATION_ERROR
```

### Angular UI checklist

| # | Scenario | Expect |
|---|----------|--------|
| 1 | Strategy detail → **Explain** / **Check for issues** with AI enabled (stub) | Disclaimer shown; escaped text; buttons disable while loading |
| 2 | Same buttons with `AI_ENABLED=false` | Distinct “Kernel AI is disabled…” message |
| 3 | Backtest detail → **Explain results** / **Suggest improvements** | Disclaimer; issues/suggestions list; no Apply button |
| 4 | Force quota (`AI_DAILY_CALL_LIMIT=1`, call twice) | Second call shows daily limit message |

### Regression checklist

| Scenario | Command / UI | Expect |
|----------|--------------|--------|
| Stub explain strategy | curl above | 200 + disclaimer + explanation |
| Hybrid validate | curl validate | warnings include deterministic codes |
| Explain backtest | curl explain-backtest | 200 + issues array |
| Suggest improvements | curl suggest | suggestions capped, advisory only |
| Disabled flag | AI_ENABLED=false | 503 AI_DISABLED |
| Cross-user strategy | other token | 404 STRATEGY_NOT_FOUND |

---

## Section 15 – Cache, provider guardrails & deploy readiness (Milestone 7)

### Cache hit behavior (seed mode)

```bash
# First candle read populates cache; second identical read should match body.
curl -s 'http://localhost:4000/api/market-data/equity/candles?symbol=AAPL&start=2024-01-01&end=2024-12-31' -o /tmp/c1.json
curl -s 'http://localhost:4000/api/market-data/equity/candles?symbol=AAPL&start=2024-01-01&end=2024-12-31' -o /tmp/c2.json
diff /tmp/c1.json /tmp/c2.json

# Metrics should show candles hit/miss counters when METRICS_ENABLED=true
curl -s http://localhost:4000/api/metrics | jq '.cache'
```

### Provider / health

```bash
curl -s http://localhost:4000/api/market-data/health | jq '{status,source,provider}'
# expect provider.configured == "seed" when MARKET_DATA_LIVE_ENABLED=false
# expect provider.circuit == "closed"
```

### Deploy artifacts checklist (no live accounts required)

| # | Check | Expect |
|---|-------|--------|
| 1 | `.github/workflows/ci.yml` present | API + web jobs |
| 2 | `.github/workflows/deploy.yml` present | migrate → Fly API → Vercel web |
| 3 | `apps/api/Dockerfile` + `fly.toml` | Option A always-on API |
| 4 | `apps/web/vercel.json` | SPA fallback rewrite |
| 5 | `docs/ops/deployment.md` | secrets + smoke + rollback |

Live Fly/Vercel/MySQL provisioning remains an operator step before first production URL.

---

**File:** `docs/manual-testing/manual_testing.md`
