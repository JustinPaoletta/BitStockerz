import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { MarketDataService } from './market-data.service';

function createConfig(overrides?: Partial<AppConfigService>): AppConfigService {
  return {
    server: {
      nodeEnv: 'test',
    },
    dependencies: {
      databaseUrl: undefined,
      marketDataHealthUrl: undefined,
    },
    ...overrides,
  } as AppConfigService;
}

describe('MarketDataService', () => {
  it('looks up seeded equity symbols case-insensitively when Prisma is disabled', async () => {
    const service = new MarketDataService(new PrismaService(createConfig()));

    await expect(service.lookupSymbol(' aapl ')).resolves.toEqual({
      id: 1,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      asset_type: 'EQUITY',
      exchange: 'NASDAQ',
      currency: 'USD',
      base_asset: undefined,
      quote_asset: undefined,
      is_active: true,
    });
  });

  it('throws NOT_FOUND for unknown symbols', async () => {
    const service = new MarketDataService(new PrismaService(createConfig()));

    try {
      await service.lookupSymbol('missing');
      fail('Expected lookup to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('searches seeded symbols by symbol, name, and asset type', async () => {
    const service = new MarketDataService(new PrismaService(createConfig()));

    const cryptoResults = await service.searchSymbols({
      q: 'usd',
      assetType: 'CRYPTO',
    });

    expect(cryptoResults.map((record) => record.symbol)).toEqual([
      'BTC-USD',
      'ETH-USD',
    ]);

    const equityResults = await service.searchSymbols({
      q: 'apple',
      assetType: 'EQUITY',
    });

    expect(equityResults).toHaveLength(1);
    expect(equityResults[0].symbol).toBe('AAPL');
  });

  it('honors search limits for seeded symbols', async () => {
    const service = new MarketDataService(new PrismaService(createConfig()));

    const results = await service.searchSymbols({ limit: 2 });

    expect(results).toHaveLength(2);
    expect(results.map((record) => record.symbol)).toEqual(['AAPL', 'BTC-USD']);
  });

  it('uses Prisma when enabled', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 99,
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      assetType: 'EQUITY',
      exchange: 'NASDAQ',
      currency: 'USD',
      baseAsset: null,
      quoteAsset: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const findMany = jest.fn().mockResolvedValue([
      {
        id: 100,
        symbol: 'BTC-USD',
        name: 'Bitcoin / US Dollar',
        assetType: 'CRYPTO',
        exchange: null,
        currency: 'USD',
        baseAsset: 'BTC',
        quoteAsset: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const prisma = {
      isEnabled: true,
      symbol: {
        findUnique,
        findMany,
      },
    } as unknown as PrismaService;

    const service = new MarketDataService(prisma);

    await expect(service.lookupSymbol('nvda')).resolves.toMatchObject({
      symbol: 'NVDA',
      asset_type: 'EQUITY',
    });

    await expect(
      service.searchSymbols({ q: 'btc', assetType: 'CRYPTO', limit: 5 }),
    ).resolves.toEqual([
      {
        id: 100,
        symbol: 'BTC-USD',
        name: 'Bitcoin / US Dollar',
        asset_type: 'CRYPTO',
        exchange: undefined,
        currency: 'USD',
        base_asset: 'BTC',
        quote_asset: 'USD',
        is_active: true,
      },
    ]);

    expect(findUnique).toHaveBeenCalledWith({ where: { symbol: 'NVDA' } });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        assetType: 'CRYPTO',
        OR: [
          { symbol: { contains: 'btc' } },
          { name: { contains: 'btc' } },
          { baseAsset: { contains: 'btc' } },
          { quoteAsset: { contains: 'btc' } },
        ],
      },
      orderBy: [{ symbol: 'asc' }],
      take: 5,
    });
  });
});
