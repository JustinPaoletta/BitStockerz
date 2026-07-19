# BitStockerz API – Manual Testing Guide

Use this guide to smoke-test the runnable API in `apps/api` after local changes. All paths below are prefixed with `/api` and assume the server listens on port **4000** (override with `PORT`).

## Section 0 – Local setup

### Install and start

```bash
npm install
npm --prefix apps/api install
npm --prefix apps/api run start:dev
```

### MySQL (recommended for persistence tests)

Full Docker setup: [docs/database/Local_MySQL.md](../database/Local_MySQL.md)

```bash
./scripts/docker-mysql.sh start
cp apps/api/.env.example apps/api/.env   # skip if .env already exists
# Ensure DATABASE_URL is set in apps/api/.env
npm --prefix apps/api run db:deploy
npm --prefix apps/api run start:dev
```

Set `INGESTION_SCHEDULER_ENABLED=false` in `apps/api/.env` while running Section 8 manually so hourly cron does not interfere.

### Database modes

| Mode | When | Behavior |
| --- | --- | --- |
| **In-memory** | No `DATABASE_URL` | Auth, symbols, candles, and jobs use deterministic seed data in process. Data resets on API restart. |
| **MySQL** | `DATABASE_URL` set + migrations applied | Auth, jobs, and ingested bars persist. Symbol/candle reads use DB rows (empty until ingestion). |

### Automated alternative

With the API running:

```bash
./scripts/smoke-test-api.sh --sprint all
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify   # gates + smoke including DB persistence
```

Authenticated bearer token required for job and ingestion endpoints (Sprint 1.3).

---

## Section 1 – Health & readiness (Sprint 0.1)

```bash
curl -s http://localhost:4000/api/health/live | jq
```

Expected: `{ "status": "ok" }`

```bash
curl -s http://localhost:4000/api/health/ready | jq
```

Expected: `ready: true`.

- **Without `DATABASE_URL`:** `checks.database.status` is `not_configured`.
- **With MySQL:** `checks.database.status` is `up` with `latencyMs`.

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
| `AAPL` | 40 weekday daily bars | `2026-01-05` through mid-February 2026 |
| `MSFT` | 40 weekday daily bars | same generator pattern |
| `SPY` | 40 weekday daily bars | same generator pattern |

### Success – default ascending order

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=aapl&start=2026-01-05&end=2026-01-09' | jq
```

Expected: `200` array of five objects ordered by `date`, each with numeric `open`, `high`, `low`, `close`, `volume` and `date` formatted as `YYYY-MM-DD`.

### Success – descending order with limit

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09&order=desc&limit=2' | jq
```

Expected: `200` with two rows; newest `date` first (`2026-01-09`, then `2026-01-08`).

### Success – empty range

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2025-01-01&end=2025-01-31' | jq
```

Expected: `200` with `[]`.

### Validation – wrong asset type

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=BTC-USD&start=2026-01-05&end=2026-01-09' | jq
```

Expected: `400` with `code: "VALIDATION_ERROR"` and `fieldErrors`.

### Not found

```bash
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=NOPE&start=2026-01-05&end=2026-01-09' | jq
```

Expected: `404` with `code: "NOT_FOUND"`.

---

## Section 6 – Crypto candles (Sprint 1.2)

Public endpoint: `GET /api/market-data/crypto/candles`

### Seed symbols with candle data (no `DATABASE_URL`)

| Symbol | Daily (`interval=1d`) | Hourly (`interval=1h`) |
| --- | --- | --- |
| `BTC-USD` | 30 daily bars from `2026-01-01` | 48 hourly bars from `2026-01-15T00:00:00.000Z` |
| `ETH-USD` | 30 daily bars from `2026-01-01` | 48 hourly bars from `2026-01-15T00:00:00.000Z` |

### Success – crypto daily

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=btc-usd&interval=1d&start=2026-01-01&end=2026-01-03' | jq
```

Expected: `200` array of three objects with `date` (not `timestamp`) and numeric OHLCV fields.

### Success – crypto hourly

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2026-01-15T00:00:00.000Z&end=2026-01-15T02:00:00.000Z' | jq
```

Expected: `200` array of three objects with UTC `timestamp` ISO strings (for example `2026-01-15T00:00:00.000Z`).

### Validation – equity symbol on crypto endpoint

```bash
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=AAPL&interval=1d&start=2026-01-01&end=2026-01-03' | jq
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
| 1 | Equity happy path | Section 5 ascending `AAPL` curl | `200`, 5 bars, ascending dates |
| 2 | Equity `order` + `limit` | Section 5 descending curl | `200`, 2 bars, newest first |
| 3 | Equity empty range | Section 5 empty-range curl | `200`, `[]` |
| 4 | Equity wrong asset | Section 5 `BTC-USD` curl | `400`, `VALIDATION_ERROR` |
| 5 | Crypto daily happy path | Section 6 daily curl | `200`, 3 bars with `date` |
| 6 | Crypto hourly happy path | Section 6 hourly curl | `200`, 3 bars with `timestamp` |
| 7 | Crypto wrong asset | Section 6 `AAPL` curl | `400`, `VALIDATION_ERROR` |
| 8 | Unknown symbol | Section 5 `NOPE` curl | `404`, `NOT_FOUND` |
| 9 | Reversed equity range | `curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-02-01&end=2026-01-01'` | `400`, `VALIDATION_ERROR` |
| 10 | Invalid limit | `curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09&limit=0'` | `400`, `VALIDATION_ERROR` |

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

## Section 8 – Ingestion regression checklist

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
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09' | jq '.code'
```

Expected on a **fresh migrated DB (before ingestion):** `NOT_FOUND` for both (no seed fallback when Prisma is enabled).

### 9.3 Run ingestion (Section 8)

Complete Section 8 equity and crypto import curls with a bearer token.

### 9.4 Symbols and candles after ingestion

```bash
curl -s http://localhost:4000/api/symbols/AAPL | jq '.symbol'
curl -s 'http://localhost:4000/api/market-data/equities/candles?symbol=AAPL&start=2026-01-05&end=2026-01-09' | jq 'length'
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1d&start=2026-01-01&end=2026-01-03' | jq 'length'
curl -s 'http://localhost:4000/api/market-data/crypto/candles?symbol=BTC-USD&interval=1h&start=2026-01-15T00:00:00.000Z&end=2026-01-15T02:00:00.000Z' | jq 'length'
```

Expected: `"AAPL"`, then `5`, `3`, and `3` respectively.

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

**File:** `docs/manual-testing/manual_testing.md`
