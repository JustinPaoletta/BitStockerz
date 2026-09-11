import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { TtlCacheService } from '../../common/cache/ttl-cache.service';
import type { AppConfigService } from '../../config/app-config.service';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveMarketDataProvider } from '../providers/live.provider';
import { ProviderRouterService } from '../providers/provider-router.service';
import { SeedMarketDataProvider } from '../providers/seed.provider';
import { CandleSanityService } from '../sanity/candle-sanity.service';
import { MarketDataIngestionService } from './market-data-ingestion.service';

function createConfig(): AppConfigService {
  return {
    server: { nodeEnv: 'test', port: 4000 },
    dependencies: { databaseUrl: undefined },
    marketData: {
      liveEnabled: false,
      circuitFailures: 3,
      circuitCooldownMs: 60_000,
      staleEquityDailyMs: 1,
      staleCryptoDailyMs: 1,
      staleCryptoHourlyMs: 1,
    },
    cache: {
      enabled: true,
      candlesTtlMs: 60_000,
      symbolsTtlMs: 60_000,
      maxEntries: 500,
    },
    metrics: { enabled: true },
  } as AppConfigService;
}

function createService(prisma?: PrismaService): MarketDataIngestionService {
  const config = createConfig();
  const prismaService = prisma ?? new PrismaService(config);
  const metrics = new MetricsService(config);
  const cache = new TtlCacheService(config, metrics);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const providers = new ProviderRouterService(
    config,
    prismaService,
    new SeedMarketDataProvider(),
    new LiveMarketDataProvider(),
    metrics,
    audit as never,
  );
  return new MarketDataIngestionService(
    prismaService,
    new CandleSanityService(),
    providers,
    cache,
  );
}

describe('MarketDataIngestionService', () => {
  it('imports all seed equity bars in memory mode', async () => {
    const service = createService();

    const result = await service.importEquityDaily();

    expect(result.symbolsProcessed).toBe(3);
    expect(result.importedBars).toBe(120);
  });

  it('imports crypto daily and hourly bars for a single symbol', async () => {
    const service = createService();

    const result = await service.importCrypto({ symbol: 'BTC-USD' });

    expect(result.symbolsProcessed).toBe(1);
    expect(result.importedDailyBars).toBe(30);
    expect(result.importedHourlyBars).toBe(48);
  });

  it('throws NOT_FOUND for unknown symbols', async () => {
    const service = createService();

    try {
      await service.importEquityDaily({ symbol: 'NOPE' });
      fail('Expected import to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('upserts equity bars through Prisma when enabled', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const symbolUpsert = jest.fn().mockResolvedValue({ id: 11 });
    const prisma = {
      isEnabled: true,
      symbol: { upsert: symbolUpsert },
      equityDailyBar: { upsert },
      cryptoDailyBar: { upsert: jest.fn() },
      cryptoHourlyBar: { upsert: jest.fn() },
    };

    const service = createService(prisma as never);
    const result = await service.importEquityDaily({ symbol: 'AAPL' });

    expect(result.symbolsProcessed).toBe(1);
    expect(result.importedBars).toBe(40);
    expect(symbolUpsert).toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(40);
  });

  it('upserts crypto daily and hourly bars through Prisma when enabled', async () => {
    const dailyUpsert = jest.fn().mockResolvedValue({});
    const hourlyUpsert = jest.fn().mockResolvedValue({});
    const symbolUpsert = jest.fn().mockResolvedValue({ id: 12 });
    const prisma = {
      isEnabled: true,
      symbol: { upsert: symbolUpsert },
      equityDailyBar: { upsert: jest.fn() },
      cryptoDailyBar: { upsert: dailyUpsert },
      cryptoHourlyBar: { upsert: hourlyUpsert },
    };

    const service = createService(prisma as never);
    const result = await service.importCrypto({
      symbol: 'BTC-USD',
      intervals: ['1d', '1h'],
    });

    expect(result.importedDailyBars).toBe(30);
    expect(result.importedHourlyBars).toBe(48);
    expect(dailyUpsert).toHaveBeenCalledTimes(30);
    expect(hourlyUpsert).toHaveBeenCalledTimes(48);
  });

  it('imports only requested crypto intervals', async () => {
    const service = createService();

    const dailyOnly = await service.importCrypto({
      symbol: 'ETH-USD',
      intervals: ['1d'],
    });

    expect(dailyOnly.importedDailyBars).toBe(30);
    expect(dailyOnly.importedHourlyBars).toBe(0);
  });

  it('imports all seed equity symbols through Prisma when enabled', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const symbolUpsert = jest
      .fn()
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce({ id: 2 })
      .mockResolvedValueOnce({ id: 3 });
    const prisma = {
      isEnabled: true,
      symbol: { upsert: symbolUpsert },
      equityDailyBar: { upsert },
      cryptoDailyBar: { upsert: jest.fn() },
      cryptoHourlyBar: { upsert: jest.fn() },
    };

    const service = createService(prisma as never);
    const result = await service.importEquityDaily();

    expect(result.symbolsProcessed).toBe(3);
    expect(result.importedBars).toBe(120);
    expect(symbolUpsert).toHaveBeenCalledTimes(3);
  });

  it('imports only hourly crypto bars through Prisma when requested', async () => {
    const hourlyUpsert = jest.fn().mockResolvedValue({});
    const symbolUpsert = jest.fn().mockResolvedValue({ id: 4 });
    const prisma = {
      isEnabled: true,
      symbol: { upsert: symbolUpsert },
      equityDailyBar: { upsert: jest.fn() },
      cryptoDailyBar: { upsert: jest.fn() },
      cryptoHourlyBar: { upsert: hourlyUpsert },
    };

    const service = createService(prisma as never);
    const result = await service.importCrypto({
      symbol: 'ETH-USD',
      intervals: ['1h'],
    });

    expect(result.importedDailyBars).toBe(0);
    expect(result.importedHourlyBars).toBe(48);
    expect(hourlyUpsert).toHaveBeenCalledTimes(48);
  });
});
