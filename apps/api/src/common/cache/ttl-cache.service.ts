import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { MetricsService } from '../../observability/metrics.service';

export type CacheNamespace = 'symbols' | 'candles';
export type CacheClock = () => number;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const SWEEP_EVERY_N_OPS = 32;

@Injectable()
export class TtlCacheService {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private opsSinceSweep = 0;
  private clock: CacheClock = () => Date.now();

  constructor(
    private readonly config: AppConfigService,
    private readonly metrics: MetricsService,
  ) {}

  /** Test helper for fake-clock expiry / LRU cases. */
  setClockForTests(clock: CacheClock): void {
    this.clock = clock;
  }

  get enabled(): boolean {
    return this.config.cache.enabled;
  }

  get size(): number {
    return this.entries.size;
  }

  get<T>(key: string, namespace: CacheNamespace): T | undefined {
    if (!this.enabled) {
      return undefined;
    }

    this.maybeSweep();
    const entry = this.entries.get(key);
    if (!entry) {
      this.metrics.recordCache(namespace, 'miss');
      return undefined;
    }

    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      this.metrics.recordCache(namespace, 'miss');
      return undefined;
    }

    // Refresh LRU recency.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.metrics.recordCache(namespace, 'hit');
    return cloneValue(entry.value) as T;
  }

  set<T>(
    key: string,
    value: T,
    namespace: CacheNamespace,
    ttlMs?: number,
  ): void {
    if (!this.enabled) {
      return;
    }

    const ttl = ttlMs ?? this.defaultTtlMs(namespace);
    this.entries.delete(key);
    this.entries.set(key, {
      value: cloneValue(value),
      expiresAt: this.clock() + ttl,
    });
    this.evictIfNeeded();
    this.maybeSweep();
  }

  async getOrLoad<T>(
    key: string,
    namespace: CacheNamespace,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    if (!this.enabled) {
      return loader();
    }

    const cached = this.getWithoutMetric(key);
    if (cached.hit) {
      this.metrics.recordCache(namespace, 'hit');
      return cloneValue(cached.value) as T;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing.then((value) => cloneValue(value) as T);
    }

    this.metrics.recordCache(namespace, 'miss');
    const pending = (async () => {
      try {
        const loaded = await loader();
        this.set(key, loaded, namespace, ttlMs);
        return loaded;
      } catch (error) {
        this.metrics.recordCache(namespace, 'load_error');
        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, pending);
    return pending.then((value) => cloneValue(value));
  }

  delete(key: string): void {
    this.entries.delete(key);
    this.inFlight.delete(key);
  }

  deleteByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    for (const key of [...this.inFlight.keys()]) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key);
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  private getWithoutMetric(
    key: string,
  ): { hit: true; value: unknown } | { hit: false } {
    this.maybeSweep();
    const entry = this.entries.get(key);
    if (!entry) {
      return { hit: false };
    }
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return { hit: false };
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { hit: true, value: entry.value };
  }

  private defaultTtlMs(namespace: CacheNamespace): number {
    return namespace === 'candles'
      ? this.config.cache.candlesTtlMs
      : this.config.cache.symbolsTtlMs;
  }

  private evictIfNeeded(): void {
    const maxEntries = this.config.cache.maxEntries;
    while (this.entries.size > maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
      const namespace = oldestKey.startsWith('candles:')
        ? 'candles'
        : 'symbols';
      this.metrics.recordCache(namespace, 'eviction');
    }
  }

  private maybeSweep(): void {
    this.opsSinceSweep += 1;
    if (this.opsSinceSweep < SWEEP_EVERY_N_OPS) {
      return;
    }
    this.opsSinceSweep = 0;
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }
}

function cloneValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  return structuredClone(value);
}

export function buildSymbolLookupCacheKey(symbol: string): string {
  return `symbols:lookup:${symbol.trim().toUpperCase()}`;
}

export function buildSymbolSearchCacheKey(input: {
  q: string;
  assetType?: string;
  limit: number;
}): string {
  const query = input.q.trim().toUpperCase();
  const asset = (input.assetType ?? 'ALL').toUpperCase();
  return `symbols:search:${asset}:${query}:${input.limit}`;
}

export function buildCandleCacheKey(input: {
  assetType: 'EQUITY' | 'CRYPTO';
  symbol: string;
  interval: '1d' | '1h';
  start: string;
  end: string;
  order: string;
  limit: number;
}): string {
  const asset = input.assetType.toLowerCase();
  return `candles:${asset}:${input.symbol.trim().toUpperCase()}:${input.interval}:${input.start}:${input.end}:${input.order}:${input.limit}`;
}

export function candleCachePrefix(
  assetType: 'EQUITY' | 'CRYPTO',
  symbol: string,
): string {
  return `candles:${assetType.toLowerCase()}:${symbol.trim().toUpperCase()}:`;
}
