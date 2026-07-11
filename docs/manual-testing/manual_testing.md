# BitStockerz API – Manual Testing Guide

Use this guide to smoke-test the runnable API in `apps/api` after local changes. All paths below are prefixed with `/api` and assume the server listens on port **4000** (override with `PORT`).

## Prerequisites

1. From the repo root, install dependencies if needed: `npm install`
2. Start the API: `npm --prefix apps/api run start:dev`
3. **Database mode**
   - **No `DATABASE_URL` (default dev/test):** Auth, symbols, and candles use deterministic in-memory seed data.
   - **With `DATABASE_URL` (MySQL/MariaDB):** Run `npm --prefix apps/api run db:migrate`, then restart the API. Symbol rows come from the database; candle endpoints return whatever is stored in the bar tables (often `[]` until Sprint 1.3 ingestion).

No bearer token is required for health, symbol, or candle read endpoints in Sprint 1.2.

---

## Section 1 – Health & readiness (Sprint 0.1)

```bash
curl -s http://localhost:4000/api/health/live | jq
```

Expected: `{ "status": "ok" }`

```bash
curl -s http://localhost:4000/api/health/ready | jq
```

Expected: `ready: true` with `database` and `marketData` checks reported as `not_configured` when optional dependencies are unset.

---

## Section 2 – Auth shortcuts (Sprint 0.2)

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"manual@example.com","display_name":"Manual Tester"}' | jq
```

Expected: `200` with `access_token`, `token_type: "Bearer"`, and a `user` object.

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

With `DATABASE_URL` configured and empty bar tables, repeat rows 1, 2, 5, and 6; expect `200` with `[]` for valid symbols (ingestion lands in Sprint 1.3).

---

**File:** `docs/manual-testing/manual_testing.md`
