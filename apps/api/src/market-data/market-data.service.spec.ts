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

  it('treats inactive seeded symbols as not found', async () => {
    const service = new MarketDataService(new PrismaService(createConfig()));

    await expect(service.lookupSymbol('DELISTED')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });

    const results = await service.searchSymbols({ q: 'delisted' });
    expect(results).toEqual([]);
  });

  it('returns inactive Prisma symbols as not found', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 77,
      symbol: 'INACTIVE',
      name: 'Inactive Corp',
      assetType: 'EQUITY',
      exchange: 'NYSE',
      currency: 'USD',
      baseAsset: null,
      quoteAsset: null,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const prisma = {
      isEnabled: true,
      symbol: { findUnique },
    } as unknown as PrismaService;
    const service = new MarketDataService(prisma);

    await expect(service.lookupSymbol('inactive')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
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

  it('searches Prisma symbols without a text filter when q is omitted', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      isEnabled: true,
      symbol: { findMany },
    } as unknown as PrismaService;
    const service = new MarketDataService(prisma);

    await expect(service.searchSymbols({ limit: 3 })).resolves.toEqual([]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
      },
      orderBy: [{ symbol: 'asc' }],
      take: 3,
    });
  });

  describe('candles', () => {
    it('returns seeded equity candles in ascending order by default', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      const candles = await service.getEquityDailyCandles({
        symbol: ' aapl ',
        start: '2000-01-01',
        end: '2099-12-31',
      });

      expect(candles.length).toBeGreaterThan(1);
      expect(candles[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof candles[0].open).toBe('number');
      expect(typeof candles[0].high).toBe('number');
      expect(typeof candles[0].low).toBe('number');
      expect(typeof candles[0].close).toBe('number');
      expect(typeof candles[0].volume).toBe('number');
      expect(candles.map((candle) => candle.date)).toEqual(
        [...candles.map((candle) => candle.date)].sort(),
      );
    });

    it('respects descending order and limit for seeded crypto daily candles', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      const candles = await service.getCryptoCandles({
        symbol: 'btc-usd',
        interval: '1d',
        start: '2000-01-01',
        end: '2099-12-31',
        order: 'desc',
        limit: 3,
      });

      expect(candles).toHaveLength(3);
      expect(candles.every((candle) => 'date' in candle)).toBe(true);
      const dates = candles.map((candle) =>
        'date' in candle ? candle.date : '',
      );
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('returns seeded crypto hourly candles with UTC timestamps', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      const candles = await service.getCryptoCandles({
        symbol: 'ETH-USD',
        interval: '1h',
        start: '2000-01-01T00:00:00.000Z',
        end: '2099-12-31T23:59:59.999Z',
        limit: 2,
      });

      expect(candles).toHaveLength(2);
      expect(candles.every((candle) => 'timestamp' in candle)).toBe(true);
      for (const candle of candles) {
        if ('timestamp' in candle) {
          expect(candle.timestamp).toMatch(
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
          );
        }
      }
    });

    it('returns an empty array when a valid range contains no seeded bars', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(
        service.getEquityDailyCandles({
          symbol: 'AAPL',
          start: '1990-01-01',
          end: '1990-01-31',
        }),
      ).resolves.toEqual([]);
    });

    it('throws NOT_FOUND when the candle symbol is unknown', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(
        service.getCryptoCandles({
          symbol: 'NOPE-USD',
          interval: '1d',
          start: '2026-01-01',
          end: '2026-01-31',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    });

    it('throws VALIDATION_ERROR when a symbol belongs to the other asset type', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(
        service.getEquityDailyCandles({
          symbol: 'BTC-USD',
          start: '2026-01-01',
          end: '2026-01-31',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

      await expect(
        service.getCryptoCandles({
          symbol: 'AAPL',
          interval: '1d',
          start: '2026-01-01',
          end: '2026-01-31',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it('throws VALIDATION_ERROR when the start of a range is after its end', async () => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(
        service.getEquityDailyCandles({
          symbol: 'AAPL',
          start: '2026-02-01',
          end: '2026-01-01',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

      await expect(
        service.getCryptoCandles({
          symbol: 'BTC-USD',
          interval: '1h',
          start: '2026-02-01T00:00:00.000Z',
          end: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    });

    it.each([
      {
        name: 'empty symbol',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: '   ',
            start: '2026-01-01',
            end: '2026-01-02',
          }),
        field: 'symbol',
      },
      {
        name: 'invalid runtime crypto interval',
        call: (service: MarketDataService) =>
          service.getCryptoCandles({
            symbol: 'BTC-USD',
            interval: '5m' as '1d',
            start: '2026-01-01',
            end: '2026-01-02',
          }),
        field: 'interval',
      },
      {
        name: 'daily datetime',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-01-01T00:00:00.000Z',
            end: '2026-01-02',
          }),
        field: 'start',
      },
      {
        name: 'impossible daily calendar date',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-02-30',
            end: '2026-03-02',
          }),
        field: 'start',
      },
      {
        name: 'hourly datetime without timezone',
        call: (service: MarketDataService) =>
          service.getCryptoCandles({
            symbol: 'BTC-USD',
            interval: '1h',
            start: '2026-01-15T00:00:00',
            end: '2026-01-15T01:00:00.000Z',
          }),
        field: 'start',
      },
      {
        name: 'invalid runtime order',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-01-01',
            end: '2026-01-02',
            order: 'sideways' as 'asc',
          }),
        field: 'order',
      },
      {
        name: 'zero runtime limit',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-01-01',
            end: '2026-01-02',
            limit: 0,
          }),
        field: 'limit',
      },
      {
        name: 'fractional runtime limit',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-01-01',
            end: '2026-01-02',
            limit: 1.5,
          }),
        field: 'limit',
      },
      {
        name: 'excessive runtime limit',
        call: (service: MarketDataService) =>
          service.getEquityDailyCandles({
            symbol: 'AAPL',
            start: '2026-01-01',
            end: '2026-01-02',
            limit: 5001,
          }),
        field: 'limit',
      },
    ])('rejects $name when called without a DTO', async ({ call, field }) => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(call(service)).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        fieldErrors: [expect.objectContaining({ field })],
      });
    });

    it.each([
      '2026-00-15T00:00:00.000Z',
      '2026-13-15T00:00:00.000Z',
      '2026-01-00T00:00:00.000Z',
      '2026-04-31T00:00:00.000Z',
      '2026-01-15T24:00:00.000Z',
      '2026-01-15T00:60:00.000Z',
      '2026-01-15T00:00:60.000Z',
      '2026-01-15T00:00:00.000+24:00',
      '2026-01-15T00:00:00.000+05:60',
    ])('rejects invalid hourly datetime parts in %s', async (start) => {
      const service = new MarketDataService(new PrismaService(createConfig()));

      await expect(
        service.getCryptoCandles({
          symbol: 'BTC-USD',
          interval: '1h',
          start,
          end: '2026-01-16T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
        fieldErrors: [expect.objectContaining({ field: 'start' })],
      });
    });

    it('queries Prisma equity daily bars with the requested range, order, and limit', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        id: 42,
        symbol: 'AAPL',
        name: 'Apple Inc.',
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
          id: 1,
          symbolId: 42,
          date: new Date('2026-01-02T00:00:00.000Z'),
          open: '101.125000',
          high: '103.500000',
          low: '100.250000',
          close: '102.750000',
          volume: BigInt(1234567),
          provider: 'test',
          createdAt: new Date(),
        },
      ]);
      const prisma = {
        isEnabled: true,
        symbol: { findUnique },
        equityDailyBar: { findMany },
      } as unknown as PrismaService;
      const service = new MarketDataService(prisma);

      await expect(
        service.getEquityDailyCandles({
          symbol: 'aapl',
          start: '2026-01-01',
          end: '2026-01-03',
          order: 'desc',
          limit: 2,
        }),
      ).resolves.toEqual([
        {
          date: '2026-01-02',
          open: 101.125,
          high: 103.5,
          low: 100.25,
          close: 102.75,
          volume: 1234567,
        },
      ]);

      expect(findUnique).toHaveBeenCalledWith({ where: { symbol: 'AAPL' } });
      expect(findMany).toHaveBeenCalledWith({
        where: {
          symbolId: 42,
          date: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-03T00:00:00.000Z'),
          },
        },
        orderBy: { date: 'desc' },
        take: 2,
      });
    });

    it.each([
      {
        interval: '1d' as const,
        start: '2026-01-01',
        end: '2026-01-03',
        delegate: 'cryptoDailyBar' as const,
        field: 'date' as const,
      },
      {
        interval: '1h' as const,
        start: '2026-01-01T01:00:00.000Z',
        end: '2026-01-01T03:00:00.000Z',
        delegate: 'cryptoHourlyBar' as const,
        field: 'timestamp' as const,
      },
    ])(
      'queries Prisma $delegate with the requested range, order, and limit',
      async ({ interval, start, end, delegate, field }) => {
        const findUnique = jest.fn().mockResolvedValue({
          id: 4,
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
        });
        const recordTime = new Date(
          interval === '1d' ? '2026-01-02T00:00:00.000Z' : start,
        );
        const decimal = (value: string) => ({
          toString: () => value,
        });
        const findMany = jest.fn().mockResolvedValue([
          {
            id: 7,
            symbolId: 4,
            [field]: recordTime,
            open: decimal('100.125'),
            high: decimal('102.5'),
            low: decimal('99.25'),
            close: decimal('101.75'),
            volume: decimal('456.125'),
            provider: 'test',
            createdAt: new Date(),
          },
        ]);
        const prisma = {
          isEnabled: true,
          symbol: { findUnique },
          [delegate]: { findMany },
        } as unknown as PrismaService;
        const service = new MarketDataService(prisma);

        const result = await service.getCryptoCandles({
          symbol: 'BTC-USD',
          interval,
          start,
          end,
          order: 'desc',
          limit: 7,
        });

        expect(result).toEqual([
          {
            ...(interval === '1d'
              ? { date: '2026-01-02' }
              : { timestamp: recordTime.toISOString() }),
            open: 100.125,
            high: 102.5,
            low: 99.25,
            close: 101.75,
            volume: 456.125,
          },
        ]);

        expect(findMany).toHaveBeenCalledWith({
          where: {
            symbolId: 4,
            [field]: {
              gte: new Date(start),
              lte: new Date(end),
            },
          },
          orderBy: { [field]: 'desc' },
          take: 7,
        });
      },
    );
  });
});
