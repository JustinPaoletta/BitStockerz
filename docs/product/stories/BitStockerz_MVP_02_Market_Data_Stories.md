
# BitStockerz MVP – 2) Market Data (Stories)

This document defines the epics and user stories for **Market Data** in the BitStockerz MVP.
Scope includes:
- Canonical symbol directory (stocks + crypto)
- Historical OHLCV data (equities daily, crypto daily + hourly)
- Symbol search and selection
- Minimal caching, data quality, and health monitoring

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
### Story 2.2.3 – Equity daily candles API

---

## Epic 2.3 – Historical Crypto OHLCV (Daily + Hourly)

### Story 2.3.1 – Crypto OHLCV schema
### Story 2.3.2 – Crypto daily/hourly import
### Story 2.3.3 – Crypto candles API

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
