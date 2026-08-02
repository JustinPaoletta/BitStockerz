# Sprint 7.1 — Polish & Caching

**Status:** Plan ready (not started)  
**Roadmap marker:** Milestone 7 — Polish & Resilience  
**Branch (when implementing):** `feat/sprint-7-1-polish-caching`  
**PR base:** `feat/sprint-6-3-backtest-intelligence` (or `main` if Milestone 6 merged)

**Overview:** Add in-process TTL caching for hot candle/symbol reads, define provider-fallback guardrails (circuit-breaker style interface) even if live vendor is still seed-backed, and apply UX/perf refinements across API + Angular. Use a simple custom TTL cache service; do not introduce `@nestjs/cache-manager` unless JC-1 is explicitly reversed.

---

## Sprint scope and exit criteria

**Stories**

| ID | Title | Source |
|----|-------|--------|
| #2.5.1 | In-memory cache for recent candles | [MVP_02](../product/stories/BitStockerz_MVP_02_Market_Data_Stories.md) (title-only) |
| #2.5.2 | Guardrails for provider fallbacks | same |
| UX/perf | Dashboard/API refinements | ROADMAP Milestone 7.1 |

**Exit:** System runs efficiently with caching and provider fallbacks (or documented fallback interface + seed behavior).

**Explicitly out of scope**

| Item | Why deferred |
|------|----------------|
| Redis / distributed cache | Single-region MVP; in-process enough |
| Full live vendor integration (Polygon etc.) | May still be seed; guardrails interface is the deliverable if vendor not chosen |
| Prometheus cache metrics exporters | Keep MetricsService hooks light |
| Multi-region invalidation | Single process assumption (aligns with 7.2 Option A) |

---

## Prerequisites

| Capability | Location | Relevance |
|------------|----------|-----------|
| Candle + symbol read services | `market-data.service.ts` | Cache wrap points |
| Ingestion upsert | `MarketDataIngestionService` | Cache invalidation on write |
| Market-data health / sanity | Sprint 1.4 | Fallback status signals |
| Config service | `AppConfigService` | TTLs, cache enabled flag |
| Angular dashboard | Milestone 5 | Client perf refinements |
| NFR freshness / latency | `Non_Functional_Requirements.md` | Targets |

---

## Acceptance criteria (implementation contract)

### #2.5.1 – In-memory cache

- Introduce a custom `TtlCacheService` (Map + expiry + deterministic LRU) per JC-1.
- Cache keys for:
  - Symbol search / lookup responses (short TTL, e.g. 60s).
  - Equity/crypto candle range queries (TTL e.g. 30–120s; include symbol, interval, start, end, order, limit in key).
- Config: `CACHE_ENABLED` (default true), `CACHE_CANDLES_TTL_MS`, `CACHE_SYMBOLS_TTL_MS`, `CACHE_MAX_ENTRIES` (evict LRU or clear oldest).
- On ingestion success for a symbol: invalidate candle keys for that symbol (prefix delete).
- Cache keys use a canonical serializer over normalized symbol/query, asset type, interval, inclusive UTC range, order, and limit; never rely on object property order or raw user casing.
- `getOrLoad` coalesces concurrent identical misses. Cache successful empty arrays, but never cache thrown errors/rejections.
- Cached values are treated as immutable (freeze in tests/development or return defensive copies) so one caller cannot corrupt another response.
- LRU semantics: successful `get` refreshes recency; insert over capacity evicts exactly the least-recently-used entry; expired entries are removed lazily plus bounded opportunistic sweep.
- Invalidation runs only after ingestion’s DB transaction commits and deletes every interval/range key for the affected symbol.
- Unit tests: hit/miss, fake-clock expiry, concurrent miss coalescing, failed-loader retry, mutation isolation, prefix invalidation, and exact LRU eviction.
- Required cardinality-safe metrics: hit, miss, load_error, eviction by cache namespace only (`symbols`/`candles`), never by symbol/key.
- Seed mode and DB mode both benefit (cache sits above data source).

### #2.5.2 – Provider fallback guardrails

- Define `MarketDataProvider` interface:

```typescript
interface MarketDataProvider {
  readonly name: string;
  fetchEquityDaily(...): Promise<Bars>;
  fetchCrypto(...): Promise<Bars>;
}
```

- Implementations: `SeedMarketDataProvider` (existing seed path), future `LiveMarketDataProvider`.
- `ProviderRouter` is used by ingestion, not the public read path. Public reads remain local DB/seed reads behind the cache.
- Provider guardrails:
  - Prefer live ingestion when configured + healthy.
  - On transient live failure (timeout, 429, 5xx, network, circuit open): retain/serve last-known DB bars and record `market_data.provider_fallback`. Synthetic seed data is fallback only when Prisma is disabled in development/test; production never substitutes seed prices.
  - Circuit breaker: after **N** consecutive failures (default 3), open for **cooldown** (e.g. 60s); half-open single probe.
- One breaker state per live provider + feed type. Count transient provider failures only; validation/configuration errors fail immediately and do not trip the circuit. Any successful probe resets the consecutive-failure count.
- In half-open state, permit one in-flight probe; concurrent calls use last-known data without launching more probes.
- If live vendor **not** wired this sprint: ship interface + Seed provider + breaker unit tests with a fake failing live adapter; document “live adapter plugs in here”.
- Never return 500 solely because live is down if local DB data can satisfy the read. Health reports degraded/stale honestly.
- Health endpoint may expose `provider: { active, circuit: "closed"|"open" }` (non-breaking additive field).

### UX / performance refinements

- API: ensure candle handlers use cache; confirm `limit` defaults respected.
- Angular: avoid duplicate widget fetches on trivial re-renders; keep no-polling rule from 5.2.
- Manual testing notes for cache hit behavior (second identical request faster / same data).
- Fix any known dashboard jank filed during Milestone 5–6 (small list; don’t boil ocean).

---

## API contract

**No new required public endpoints.** Optional additive fields:

### `GET /api/market-data/health` (extend)

```json
{
  "provider": {
    "configured": "seed",
    "last_success_at": "2026-07-25T15:00:00.000Z",
    "circuit": "closed",
    "last_error_code": null
  }
}
```

Cache is transparent to clients — response bodies unchanged for candles/symbols.

Config env (via AppConfig):

| Env | Default | Purpose |
|-----|---------|---------|
| `CACHE_ENABLED` | `true` | Master switch |
| `CACHE_CANDLES_TTL_MS` | `60000` | Candle TTL |
| `CACHE_SYMBOLS_TTL_MS` | `60000` | Symbol TTL |
| `CACHE_MAX_ENTRIES` | `500` | Bound memory |
| `MARKET_DATA_LIVE_ENABLED` | `false` | Live provider switch |
| `MARKET_DATA_CIRCUIT_FAILURES` | `3` | Open threshold |
| `MARKET_DATA_CIRCUIT_COOLDOWN_MS` | `60000` | Open duration |

---

## Architecture

```mermaid
flowchart TB
  Ctrl[CandlesController / SymbolsController]
  MDS[MarketDataService]
  Cache[TtlCacheService]
  Local[(Prisma bars or dev/test seed)]
  Ingest[IngestionService]
  Router[ProviderRouter]
  Live[LiveProvider optional]
  Seed[Dev/test SeedProvider]

  Ctrl --> MDS
  MDS --> Cache
  Cache -->|miss| Local
  Ingest --> Router
  Router --> Live
  Router -->|dev/test fallback only| Seed
  Ingest -->|persist| Local
  Ingest -->|after commit invalidate| Cache
```

### Proposed file layout

```text
apps/api/src/common/cache/
  ttl-cache.service.ts
  ttl-cache.service.spec.ts
apps/api/src/market-data/providers/
  market-data-provider.ts
  seed.provider.ts
  live.provider.ts          # stub/skeleton if no vendor
  provider-router.service.ts
  circuit-breaker.ts
  circuit-breaker.spec.ts
apps/api/src/market-data/market-data.service.ts  # wire cache
apps/api/src/config/app-config.service.ts
```

---

## Implementation plan (ordered)

### 1. AC in stories + config

1. Write #2.5.1–2.5.2 AC into MVP_02.
2. Config keys + unit tests.

### 2. TtlCacheService (#2.5.1)

1. `get/set/getOrLoad/delete/deleteByPrefix/clear` with injected monotonic clock.
2. Deterministic LRU, immutable-value policy, in-flight promise map, and bounded size.

### 3. Wire cache into reads

1. Symbol search/lookup + candle queries.
2. Invalidation hooks on ingestion upsert paths.
3. E2E: two identical candle GETs succeed; unit proves second is cache hit via spy.

### 4. Provider guardrails (#2.5.2)

1. Extract provider interface from ingestion only; do not route public reads to a vendor.
2. Circuit breaker pure module + tests.
3. Fake live provider fails → fallback seed/DB.
4. Document plugging real vendor (keys, rate limits) for post-MVP or late 7.1 if key available.

### 5. Polish pass

1. Angular: OnPush or signal inputs where cheap wins exist; dedupe double-fetch.
2. Docs + manual Section for cache/fallback.

| File | Update |
|------|--------|
| MVP_02 | AC + status |
| API_Inventory | Health provider field; caching note |
| NFR | Note cache contribution to latency |
| manual_testing | Cache + fallback scenarios |
| ROADMAP / CHANGELOG | 7.1 |
| `.env.example` | CACHE_* / MARKET_DATA_LIVE_* |

---

## Best-practice checklist

- [ ] Bound in-process cache (max entries + TTL) — avoid unbounded Map growth  
- [ ] Invalidate on write (ingestion)  
- [ ] Circuit breaker for flaky live dependencies  
- [ ] Config via `AppConfigService` only  
- [ ] Prefer simple TTL service over premature Redis  
- [ ] Optional Nest caching docs (if choosing cache-manager): https://docs.nestjs.com/techniques/caching — **default: skip** (JC-1)  
- [ ] Conventional Commits: `feat: add market data ttl cache and provider guardrails`

---

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Stale candles after ingest | Prefix invalidation; short TTL |
| Memory pressure | `CACHE_MAX_ENTRIES` + small TTLs |
| Serverless multi-instance cache miss | Document in-process limitation; 7.2 Option A always-on |
| Over-refactor providers | Adapter around existing seed path; don’t rewrite Milestone 1 |
| Live vendor still unknown | Interface + fake live for tests; ROADMAP honesty |

---

## Adopted defaults and external prerequisites

| # | Blocker | Why it blocks | Default if unanswered | Status |
|---|---------|---------------|----------------------|--------|
| 1 | Live market data vendor + API key | Real provider path | Fake live breaker tests + dev/test seed; production retains DB data | External prerequisite only for real vendor adapter |
| 2 | Cache TTL defaults | Freshness vs load | 60s candles/symbols | Adopted |
| 3 | `@nestjs/cache-manager` vs custom | Dep surface | Custom Map+TTL+LRU (JC-1) | Adopted |
| 4 | UX polish list | Scope | Dashboard duplicate-fetch fixes + issues already filed before sprint start | Adopted; freeze issue list at kickoff |

---

## Judgement calls

| ID | Decision | Why | Discuss before implement if |
|----|----------|-----|-----------------------------|
| **JC-1** | **Simple in-process `TtlCacheService`** (Map+TTL), not `@nestjs/cache-manager` | Fewer deps; sufficient for single Node process; easy invalidation by prefix | Team already standardized on cache-manager |
| **JC-2** | Live vendor **optional** this sprint; **guardrails interface required**; production never falls back to synthetic seed data | ROADMAP historically deferred vendor; fake prices must not masquerade as production fallback | Vendor chosen and key ready — then wire thin adapter |
| **JC-3** | Default TTLs **60s**; invalidate on ingestion | Balances NFR freshness with read amplification | Need longer cache for heavy backtests |
| **JC-4** | Circuit breaker in-process (not Redis) | Matches single-region always-on API assumption | Moving to serverless multi-instance (7.2 Option B) |

---

## Suggested ticket breakdown

| Ticket | Estimate |
|--------|----------|
| Config + TtlCacheService + tests | 0.75d |
| Wire cache + invalidation + e2e/unit | 1.0d |
| Provider interface + circuit breaker + fake live | 1.0d |
| Health field + docs + Angular polish | 0.75d |

**Total:** ~3.5 engineering days.

---

## Definition of done

- [ ] Candle/symbol reads cached with TTL + invalidation
- [ ] Provider fallback/circuit interface tested on ingestion path (live optional; no production seed fallback)
- [ ] Config documented; cache/fallback metrics and audit hooks present
- [ ] Manual testing covers hit + fallback
- [ ] PR: `feat: add market data ttl cache and provider guardrails`

---

## References

- NestJS caching (alternative): https://docs.nestjs.com/techniques/caching  
- MVP_02 Epic 2.5: `docs/product/stories/BitStockerz_MVP_02_Market_Data_Stories.md`  
- NFR: `docs/product/requirements/Non_Functional_Requirements.md`  
- Market data health: Sprint 1.4 patterns in `apps/api/src/market-data`  
- ROADMAP Milestone 7.1
