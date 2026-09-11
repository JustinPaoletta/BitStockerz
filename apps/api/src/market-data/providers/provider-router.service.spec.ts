import type { AppConfigService } from '../../config/app-config.service';
import type { AuditService } from '../../observability/audit.service';
import type { MetricsService } from '../../observability/metrics.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { PermanentProviderError } from './circuit-breaker';
import type { MarketDataProvider } from './market-data-provider';
import { ProviderRouterService } from './provider-router.service';
import type { SeedMarketDataProvider } from './seed.provider';
import type { LiveMarketDataProvider } from './live.provider';

function createConfig(overrides?: {
  liveEnabled?: boolean;
  nodeEnv?: 'development' | 'test' | 'production';
}): AppConfigService {
  return {
    server: { nodeEnv: overrides?.nodeEnv ?? 'test' },
    marketData: {
      liveEnabled: overrides?.liveEnabled ?? true,
      circuitFailures: 3,
      circuitCooldownMs: 60_000,
      staleEquityDailyMs: 1,
      staleCryptoDailyMs: 1,
      staleCryptoHourlyMs: 1,
    },
  } as AppConfigService;
}

function createRouter(options?: {
  liveEnabled?: boolean;
  nodeEnv?: 'development' | 'test' | 'production';
  prismaEnabled?: boolean;
  live?: MarketDataProvider;
}) {
  const config = createConfig(options);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const metrics = { recordError: jest.fn() };
  const seed: SeedMarketDataProvider = {
    name: 'seed',
    fetchEquityDaily: jest.fn().mockResolvedValue([{ symbolId: 1 }]),
    fetchCryptoDaily: jest.fn().mockResolvedValue([]),
    fetchCryptoHourly: jest.fn().mockResolvedValue([]),
  } as unknown as SeedMarketDataProvider;
  const liveDefault: LiveMarketDataProvider = {
    name: 'live',
    fetchEquityDaily: jest.fn(),
    fetchCryptoDaily: jest.fn(),
    fetchCryptoHourly: jest.fn(),
  } as unknown as LiveMarketDataProvider;

  const router = new ProviderRouterService(
    config,
    { isEnabled: options?.prismaEnabled ?? false } as PrismaService,
    seed,
    liveDefault,
    metrics as unknown as MetricsService,
    audit as unknown as AuditService,
  );
  if (options?.live) {
    router.setLiveProviderForTests(options.live);
  }
  return { router, seed, audit, metrics };
}

describe('ProviderRouterService', () => {
  it('uses seed when live ingestion is disabled', async () => {
    const { router, seed } = createRouter({ liveEnabled: false });
    const result = await router.fetchEquityDaily(1, 'AAPL');
    expect(result.source).toBe('seed');
    expect(seed.fetchEquityDaily).toHaveBeenCalled();
  });

  it('falls back to seed in non-production seed mode when live fails transiently', async () => {
    const failingLive: MarketDataProvider = {
      name: 'fake-live',
      fetchEquityDaily: jest.fn().mockRejectedValue(new Error('timeout')),
      fetchCryptoDaily: jest.fn(),
      fetchCryptoHourly: jest.fn(),
    };
    const { router, seed, audit } = createRouter({
      liveEnabled: true,
      prismaEnabled: false,
      nodeEnv: 'test',
      live: failingLive,
    });

    const result = await router.fetchEquityDaily(1, 'AAPL');
    expect(result.source).toBe('seed');
    expect(seed.fetchEquityDaily).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'market_data.provider_fallback' }),
    );
  });

  it('does not substitute seed in production when live fails', async () => {
    const failingLive: MarketDataProvider = {
      name: 'fake-live',
      fetchEquityDaily: jest.fn().mockRejectedValue(new Error('503 upstream')),
      fetchCryptoDaily: jest.fn(),
      fetchCryptoHourly: jest.fn(),
    };
    const { router, seed } = createRouter({
      liveEnabled: true,
      prismaEnabled: true,
      nodeEnv: 'production',
      live: failingLive,
    });

    const result = await router.fetchEquityDaily(1, 'AAPL');
    expect(result.source).toBe('none');
    expect(result.bars).toEqual([]);
    expect(seed.fetchEquityDaily).not.toHaveBeenCalled();
  });

  it('exposes circuit health and opens after repeated live failures', async () => {
    const failingLive: MarketDataProvider = {
      name: 'fake-live',
      fetchEquityDaily: jest.fn().mockRejectedValue(new Error('timeout')),
      fetchCryptoDaily: jest.fn(),
      fetchCryptoHourly: jest.fn(),
    };

    const { router } = createRouter({
      liveEnabled: true,
      prismaEnabled: true,
      nodeEnv: 'production',
      live: failingLive,
    });

    for (let i = 0; i < 3; i += 1) {
      await router.fetchEquityDaily(1, 'AAPL');
    }

    const health = router.getHealthInfo();
    expect(health.configured).toBe('live');
    expect(health.circuit).toBe('open');
    expect(health.last_error_code).toBeTruthy();
  });

  it('does not trip circuit on permanent misconfiguration', async () => {
    const live: MarketDataProvider = {
      name: 'live',
      fetchEquityDaily: jest
        .fn()
        .mockRejectedValue(new PermanentProviderError('not configured')),
      fetchCryptoDaily: jest.fn(),
      fetchCryptoHourly: jest.fn(),
    };
    const { router } = createRouter({
      liveEnabled: true,
      prismaEnabled: true,
      nodeEnv: 'production',
      live,
    });

    await router.fetchEquityDaily(1, 'AAPL');
    expect(router.getHealthInfo().circuit).toBe('closed');
  });

  it('fetches crypto feeds through the seed provider when live is off', async () => {
    const { router, seed } = createRouter({ liveEnabled: false });
    await router.fetchCryptoDaily(4, 'BTC-USD');
    await router.fetchCryptoHourly(4, 'BTC-USD');
    expect(seed.fetchCryptoDaily).toHaveBeenCalled();
    expect(seed.fetchCryptoHourly).toHaveBeenCalled();
    expect(router.getHealthInfo().configured).toBe('seed');
  });

  it('records provider_fallback error codes for empty and non-Error failures', async () => {
    const emptyMessage = new Error('');
    const failingLive: MarketDataProvider = {
      name: 'fake-live',
      fetchEquityDaily: jest.fn().mockRejectedValueOnce(emptyMessage).mockRejectedValueOnce(42),
      fetchCryptoDaily: jest.fn(),
      fetchCryptoHourly: jest.fn(),
    };
    const { router, audit } = createRouter({
      liveEnabled: true,
      prismaEnabled: true,
      nodeEnv: 'production',
      live: failingLive,
    });

    await router.fetchEquityDaily(1, 'AAPL');
    await router.fetchEquityDaily(1, 'AAPL');
    expect(audit.record).toHaveBeenCalled();
    expect(router.getHealthInfo().last_error_code).toBeTruthy();
  });
});
