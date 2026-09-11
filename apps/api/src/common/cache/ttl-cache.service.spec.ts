import { AppConfigService } from '../../config/app-config.service';
import { MetricsService } from '../../observability/metrics.service';
import { TtlCacheService } from './ttl-cache.service';

function createConfig(
  overrides?: Partial<AppConfigService['cache']>,
): AppConfigService {
  return {
    cache: {
      enabled: true,
      candlesTtlMs: 60_000,
      symbolsTtlMs: 60_000,
      maxEntries: 3,
      ...overrides,
    },
    metrics: { enabled: true },
  } as AppConfigService;
}

describe('TtlCacheService', () => {
  let now: number;
  let metrics: MetricsService;
  let cache: TtlCacheService;

  beforeEach(() => {
    now = 1_000_000;
    const config = createConfig();
    metrics = new MetricsService(config);
    cache = new TtlCacheService(config, metrics);
    cache.setClockForTests(() => now);
  });

  it('returns undefined on miss and value on hit', async () => {
    expect(cache.get('symbols:lookup:AAPL', 'symbols')).toBeUndefined();
    cache.set('symbols:lookup:AAPL', { symbol: 'AAPL' }, 'symbols', 1000);
    expect(cache.get('symbols:lookup:AAPL', 'symbols')).toEqual({
      symbol: 'AAPL',
    });

    const snapshot = metrics.snapshot();
    expect(snapshot.cache.symbols.miss).toBe(1);
    expect(snapshot.cache.symbols.hit).toBe(1);
  });

  it('expires entries with the injected clock', () => {
    cache.set('symbols:lookup:AAPL', { symbol: 'AAPL' }, 'symbols', 500);
    now += 501;
    expect(cache.get('symbols:lookup:AAPL', 'symbols')).toBeUndefined();
  });

  it('coalesces concurrent identical misses', async () => {
    let loads = 0;
    const loader = async () => {
      loads += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return [{ id: 1 }];
    };

    const [a, b] = await Promise.all([
      cache.getOrLoad('candles:equity:AAPL:1d:a:b:asc:10', 'candles', loader),
      cache.getOrLoad('candles:equity:AAPL:1d:a:b:asc:10', 'candles', loader),
    ]);

    expect(loads).toBe(1);
    expect(a).toEqual([{ id: 1 }]);
    expect(b).toEqual([{ id: 1 }]);
    expect(metrics.snapshot().cache.candles.miss).toBe(1);
  });

  it('does not cache loader failures and allows retry', async () => {
    let attempt = 0;
    const loader = async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('boom');
      }
      return ['ok'];
    };

    await expect(
      cache.getOrLoad('symbols:search:ALL::20', 'symbols', loader),
    ).rejects.toThrow('boom');
    await expect(
      cache.getOrLoad('symbols:search:ALL::20', 'symbols', loader),
    ).resolves.toEqual(['ok']);
    expect(metrics.snapshot().cache.symbols.load_error).toBe(1);
  });

  it('isolates callers from mutating cached values', async () => {
    const value = await cache.getOrLoad(
      'symbols:lookup:MSFT',
      'symbols',
      async () => ({ symbol: 'MSFT', tags: ['a'] }),
    );
    value.tags.push('mutated');

    const again = cache.get<{ symbol: string; tags: string[] }>(
      'symbols:lookup:MSFT',
      'symbols',
    );
    expect(again?.tags).toEqual(['a']);
  });

  it('evicts the exact least-recently-used entry at capacity', () => {
    cache.set('symbols:a', 1, 'symbols');
    cache.set('symbols:b', 2, 'symbols');
    cache.set('symbols:c', 3, 'symbols');
    // Refresh a so b is LRU.
    expect(cache.get('symbols:a', 'symbols')).toBe(1);
    cache.set('symbols:d', 4, 'symbols');

    expect(cache.get('symbols:b', 'symbols')).toBeUndefined();
    expect(cache.get('symbols:a', 'symbols')).toBe(1);
    expect(cache.get('symbols:c', 'symbols')).toBe(3);
    expect(cache.get('symbols:d', 'symbols')).toBe(4);
    expect(metrics.snapshot().cache.symbols.eviction).toBe(1);
  });

  it('deletes by prefix after writes', () => {
    cache.set('candles:equity:AAPL:1d:x', [1], 'candles');
    cache.set('candles:equity:AAPL:1d:y', [2], 'candles');
    cache.set('candles:equity:MSFT:1d:x', [3], 'candles');

    expect(cache.deleteByPrefix('candles:equity:AAPL:')).toBe(2);
    expect(cache.get('candles:equity:AAPL:1d:x', 'candles')).toBeUndefined();
    expect(cache.get('candles:equity:MSFT:1d:x', 'candles')).toEqual([3]);
  });

  it('bypasses storage when disabled', async () => {
    const disabled = new TtlCacheService(
      createConfig({ enabled: false }),
      metrics,
    );
    disabled.setClockForTests(() => now);
    const value = await disabled.getOrLoad(
      'symbols:lookup:AAPL',
      'symbols',
      async () => ({
        symbol: 'AAPL',
      }),
    );
    expect(value).toEqual({ symbol: 'AAPL' });
    expect(disabled.get('symbols:lookup:AAPL', 'symbols')).toBeUndefined();
    disabled.set('symbols:lookup:AAPL', { symbol: 'AAPL' }, 'symbols');
    expect(disabled.get('symbols:lookup:AAPL', 'symbols')).toBeUndefined();
  });

  it('evicts candle namespace entries and clears in-flight by prefix', async () => {
    const config = createConfig({ maxEntries: 2 });
    const localMetrics = new MetricsService(config);
    const local = new TtlCacheService(config, localMetrics);
    local.setClockForTests(() => now);

    local.set('candles:equity:AAPL:1d:a', [1], 'candles');
    local.set('candles:equity:MSFT:1d:a', [2], 'candles');
    local.set('candles:equity:TSLA:1d:a', [3], 'candles');
    expect(localMetrics.snapshot().cache.candles.eviction).toBeGreaterThan(0);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = local.getOrLoad(
      'candles:equity:IBM:1d:z',
      'candles',
      async () => {
        await gate;
        return [9];
      },
    );
    expect(local.deleteByPrefix('candles:equity:IBM:')).toBeGreaterThanOrEqual(0);
    release();
    await expect(pending).resolves.toEqual([9]);
  });

  it('clones primitives and null without structuredClone errors', () => {
    cache.set('symbols:n', null, 'symbols');
    cache.set('symbols:s', 'ok', 'symbols');
    expect(cache.get('symbols:n', 'symbols')).toBeNull();
    expect(cache.get('symbols:s', 'symbols')).toBe('ok');
  });

  it('opportunistically sweeps expired entries after many ops', () => {
    cache.set('symbols:old', 1, 'symbols', 10);
    now += 50;
    for (let i = 0; i < 40; i += 1) {
      cache.get(`symbols:miss-${i}`, 'symbols');
    }
    expect(cache.size).toBe(0);
  });

  it('clears all entries', () => {
    cache.set('symbols:a', 1, 'symbols');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('symbols:a', 'symbols')).toBeUndefined();
  });
});
