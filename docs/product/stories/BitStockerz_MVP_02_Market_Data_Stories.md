
# BitStockerz MVP – 2) Market Data (Stories)

This document defines the epics and user stories for **Market Data** in the BitStockerz MVP.
Scope includes:
- Canonical symbol directory (stocks + crypto)
- Historical OHLCV data (equities daily, crypto daily + hourly)
- Symbol search and selection
- Minimal caching, data quality, and health monitoring

---

## Status

- Completed in Sprint 1.1 (July 3, 2026): #2.1.1–#2.1.3, #2.2.1, #2.3.1, #2.4.1
- Completed in Sprint 1.2 (July 10, 2026): #2.2.3, #2.3.3 (candle read APIs)
- Completed in Sprint 1.3 (July 11, 2026): #2.2.2, #2.3.2 (data ingestion)
- Planned for Sprint 1.4+: #2.6.1–#2.6.2 (data quality and health endpoint)
- Planned for Sprint 5.1: #2.4.2 (symbol search UI component)
- Planned for Sprint 7.1: #2.5.1–#2.5.2 (caching and provider guardrails)

---

## Epic 2.1 – Canonical Symbol Directory

### Story 2.1.1 – Basic equity symbol directory
(see chat for full acceptance criteria)

### Story 2.1.2 – Crypto symbol directory
(see chat for full acceptance criteria)

### Story 2.1.3 – Symbol lookup API
(see chat for full acceptance criteria)

---

## Epic 2.2 – Historical Equity OHLCV (Daily)

### Story 2.2.1 – Equity daily OHLCV schema
### Story 2.2.2 – Equity daily history import (initial backfill)
Acceptance criteria:
- Authenticated `POST /api/market-data/ingestion/equity` creates and runs an `equity_daily_import` job synchronously.
- Imports deterministic seed OHLCV bars into `equity_daily_bars` when `DATABASE_URL` is configured; counts imported bars in job payload without `DATABASE_URL`.
- Optional body `symbol` limits import to one active equity ticker; unknown symbols return `404 NOT_FOUND`.

### Story 2.2.3 – Equity daily candles API

**Acceptance criteria**

- `GET /api/market-data/equities/candles` is public and does not require a bearer token.
- `symbol`, `start`, and `end` are required. Symbols are trimmed, normalized to uppercase, and must resolve to an active `EQUITY` symbol.
- `start` and `end` use `YYYY-MM-DD`, define an inclusive range, and must satisfy `start <= end`.
- `order` accepts `asc` or `desc` and defaults to `asc`. `limit` accepts an integer from 1 to 5000 and defaults to 5000.
- A successful request returns `200` with an ordered array of `{ date, open, high, low, close, volume }`; `date` is `YYYY-MM-DD` and numeric database values are serialized as JSON numbers.
- A valid symbol with no candles in the requested range returns `200` with `[]`. When Prisma is disabled, deterministic in-memory seed candles provide development and test data.
- Missing or invalid query parameters, `start > end`, and a non-equity symbol return RFC 7807 `400 VALIDATION_ERROR` responses with `fieldErrors`; an unknown or inactive symbol returns `404 NOT_FOUND`.

---

## Epic 2.3 – Historical Crypto OHLCV (Daily + Hourly)

### Story 2.3.1 – Crypto OHLCV schema
### Story 2.3.2 – Crypto daily/hourly import
Acceptance criteria:
- Authenticated `POST /api/market-data/ingestion/crypto` creates and runs a `crypto_import` job synchronously.
- Supports optional `symbol` and `intervals` (`1d`, `1h`); defaults to both intervals for all active crypto symbols.
- Upserts seed bars into `crypto_daily_bars` and `crypto_hourly_bars` when Prisma is enabled.

### Story 2.3.3 – Crypto candles API

**Acceptance criteria**

- `GET /api/market-data/crypto/candles` is public and does not require a bearer token.
- `symbol`, `interval`, `start`, and `end` are required. Symbols are trimmed, normalized to uppercase, and must resolve to an active `CRYPTO` symbol; `interval` accepts `1d` or `1h`.
- Daily ranges use `YYYY-MM-DD`; hourly ranges use ISO 8601 datetimes. Ranges are inclusive and must satisfy `start <= end`.
- `order` accepts `asc` or `desc` and defaults to `asc`. `limit` accepts an integer from 1 to 5000 and defaults to 5000.
- A successful daily request returns `200` with an ordered array of `{ date, open, high, low, close, volume }`; an hourly request returns `{ timestamp, open, high, low, close, volume }`, with UTC ISO 8601 timestamps and numeric values serialized as JSON numbers.
- A valid symbol with no candles in the requested range returns `200` with `[]`. When Prisma is disabled, deterministic in-memory seed candles provide development and test data.
- Missing or invalid query parameters, `start > end`, and a non-crypto symbol return RFC 7807 `400 VALIDATION_ERROR` responses with `fieldErrors`; an unknown or inactive symbol returns `404 NOT_FOUND`.

---

## Epic 2.4 – Symbol Search & Selection

### Story 2.4.1 – Symbol search API
### Story 2.4.2 – Reusable symbol search UI component

---

## Epic 2.5 – Data Access Patterns & Caching

### Story 2.5.1 – In-memory cache for recent candles
### Story 2.5.2 – Guardrails for provider fallbacks

---

## Epic 2.6 – Minimal Data Quality & Monitoring

### Story 2.6.1 – Basic sanity checks on imported candles
### Story 2.6.2 – Market data health endpoint
