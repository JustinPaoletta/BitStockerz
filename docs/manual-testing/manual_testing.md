# BitStockerz API – Manual Testing Guide

Use this guide to smoke-test the runnable API in `apps/api` after local
changes. All API paths below are prefixed with `/api` and assume port **4000**
(override with `PORT`). The Sprint 3.4 Angular app runs on port **4200**.

For PR #9, use the single required
[pre-merge manual checklist](./PRE_MERGE_CHECKLIST.md). It is self-contained
and supersedes assembling strategy checks from multiple sections in this guide.

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
| Strategy CRUD/versioning/validation, Sprint 3.1 engine, Sprint 3.2 persistence, Sprint 3.3 backtest APIs, or Sprint 3.4 Angular UI | [PR #9 pre-merge checklist](./PRE_MERGE_CHECKLIST.md) |
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
| **In-memory** | No `DATABASE_URL` | Auth (users, sessions, passkeys), symbols, candles, jobs, strategies, backtests, metrics, and audit events live in process. Data resets on API restart. |
| **MySQL** | `DATABASE_URL` set + migrations applied | Jobs, ingested bars, audit events, strategies/versions, and backtest runs/results/trades/equity points persist. Symbol/candle reads use DB rows (empty until ingestion). Auth (sessions and passkeys) remains in-memory; persisted job, strategy, and backtest operations upsert/remap a minimal `users` row for ownership foreign keys. |

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
backtest-persistence round trip, ingests the current rolling fixture window,
and verifies strategy ownership after an API restart.

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

For PR #9, the required generated-contract and live Swagger UI assertions are
recorded in Section 16 of the
[pre-merge manual checklist](./PRE_MERGE_CHECKLIST.md).

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

The canonical, self-contained steps are in
[PRE_MERGE_CHECKLIST.md](./PRE_MERGE_CHECKLIST.md). The commands below remain a
shorter legacy regression reference; the pre-merge checklist is the only
required and current manual sign-off source for all Strategy Lab routes.

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

**File:** `docs/manual-testing/manual_testing.md`
