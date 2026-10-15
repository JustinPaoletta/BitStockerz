import type { AppConfigService } from '../config/app-config.service';
import { TtlCacheService } from '../common/cache/ttl-cache.service';
import { MetricsService } from '../observability/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from './market-data.service';
import type { ProviderRouterService } from './providers/provider-router.service';
import { CandleSanityService } from './sanity/candle-sanity.service';

// A real Friday/Monday boundary, independent of the day CI happens to run.
jest.mock('./seed-candles', () => {
  const bar = {
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    volume: 1000,
    provider: 'seed',
  };
  return {
    SEED_EQUITY_DAILY_BARS: [
      { ...bar, symbolId: 1, date: new Date('2026-10-09T00:00:00Z') },
    ],
    SEED_CRYPTO_DAILY_BARS: [
      { ...bar, symbolId: 4, date: new Date('2026-10-11T00:00:00Z') },
    ],
    SEED_CRYPTO_HOURLY_BARS: [
      { ...bar, symbolId: 4, timestamp: new Date('2026-10-12T03:00:00Z') },
    ],
  };
});

function service(staleEquityDailyMs = 172800000) {
  const config = {
    server: { nodeEnv: 'test' },
    dependencies: {},
    marketData: {
      staleEquityDailyMs,
      staleCryptoDailyMs: 129600000,
      staleCryptoHourlyMs: 7200000,
    },
    cache: { enabled: false },
    metrics: { enabled: true },
  } as AppConfigService;
  return new MarketDataService(
    new PrismaService(config),
    config,
    new CandleSanityService(),
    new TtlCacheService(config, new MetricsService(config)),
    {
      getHealthInfo: () => ({ configured: 'seed', circuit: 'closed' }),
    } as ProviderRouterService,
  );
}

describe('synthetic equity freshness', () => {
  it.each([
    ['2026-10-10T00:00:00Z', 0],
    ['2026-10-11T23:59:59Z', 0],
    ['2026-10-12T00:00:00Z', 0],
    ['2026-10-12T04:17:00Z', 15420000],
    ['2026-10-12T23:59:59Z', 86399000],
    ['2026-10-14T00:00:00Z', 172800000],
  ])('keeps completed Friday fixtures usable at %s', async (timestamp, age) => {
    const market = service();
    const now = new Date(timestamp);
    await expect(market.getLatestClose('AAPL', now)).resolves.toMatchObject({
      price: '101',
      as_of: '2026-10-09T00:00:00.000Z',
      interval: '1d',
    });
    const health = await market.getMarketDataHealth(now);
    expect(
      health.series.find((series) => series.asset_type === 'EQUITY'),
    ).toMatchObject({
      latest_timestamp: '2026-10-09',
      age_ms: age,
      stale: false,
    });
  });

  it.each(['2026-10-14T00:00:00.001Z', '2026-10-26T04:00:00Z'])(
    'still rejects expired fixtures at %s',
    async (timestamp) => {
      const market = service();
      const now = new Date(timestamp);
      await expect(market.getLatestClose('AAPL', now)).rejects.toMatchObject({
        code: 'TRADING_NO_MARKET_PRICE',
      });
      const health = await market.getMarketDataHealth(now);
      expect(
        health.series.find((series) => series.asset_type === 'EQUITY')?.stale,
      ).toBe(true);
    },
  );

  it('honors a shorter configured limit after the weekend ends', async () => {
    const market = service(3600000);
    await expect(
      market.getLatestClose('AAPL', new Date('2026-10-12T01:00:00Z')),
    ).resolves.toMatchObject({ price: '101' });
    await expect(
      market.getLatestClose('AAPL', new Date('2026-10-12T01:00:00.001Z')),
    ).rejects.toMatchObject({ code: 'TRADING_NO_MARKET_PRICE' });
  });

  it('keeps crypto on elapsed-time freshness and reports healthy Monday fixtures', async () => {
    const market = service();
    const health = await market.getMarketDataHealth(
      new Date('2026-10-12T04:17:00Z'),
    );
    expect(health.status).toBe('ok');
    expect(
      health.series.find((series) => series.interval === '1h'),
    ).toMatchObject({ age_ms: 4620000, stale: false });
    await expect(
      market.getLatestClose(
        'BTC-USD',
        new Date('2026-10-13T12:00:00.001Z'),
        '1d',
      ),
    ).rejects.toMatchObject({ code: 'TRADING_NO_MARKET_PRICE' });
  });
});
