import { CandlesController } from './candles.controller';
import { MarketDataService } from './market-data.service';

describe('CandlesController', () => {
  it('maps the equity query DTO to the service input', async () => {
    const getEquityDailyCandles = jest
      .fn()
      .mockResolvedValue([{ date: '2026-01-02' }]);
    const marketDataService = {
      getEquityDailyCandles,
    } as unknown as MarketDataService;
    const controller = new CandlesController(marketDataService);

    await expect(
      controller.getEquityCandles({
        symbol: 'AAPL',
        start: '2026-01-01',
        end: '2026-01-31',
        order: 'desc',
        limit: 25,
      }),
    ).resolves.toEqual([{ date: '2026-01-02' }]);

    expect(getEquityDailyCandles).toHaveBeenCalledWith({
      symbol: 'AAPL',
      start: '2026-01-01',
      end: '2026-01-31',
      order: 'desc',
      limit: 25,
    });
  });

  it('maps equity queries without optional fields', async () => {
    const getEquityDailyCandles = jest.fn().mockResolvedValue([]);
    const marketDataService = {
      getEquityDailyCandles,
    } as unknown as MarketDataService;
    const controller = new CandlesController(marketDataService);

    await expect(
      controller.getEquityCandles({
        symbol: 'MSFT',
        start: '2026-01-01',
        end: '2026-01-31',
      }),
    ).resolves.toEqual([]);

    expect(getEquityDailyCandles).toHaveBeenCalledWith({
      symbol: 'MSFT',
      start: '2026-01-01',
      end: '2026-01-31',
      limit: undefined,
      order: undefined,
    });
  });

  it('maps the crypto query DTO to the service input', async () => {
    const getCryptoCandles = jest
      .fn()
      .mockResolvedValue([{ timestamp: '2026-01-02T03:00:00.000Z' }]);
    const marketDataService = {
      getCryptoCandles,
    } as unknown as MarketDataService;
    const controller = new CandlesController(marketDataService);

    await expect(
      controller.getCryptoCandles({
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-02T00:00:00.000Z',
        end: '2026-01-02T23:59:59.999Z',
        order: 'asc',
        limit: 12,
      }),
    ).resolves.toEqual([{ timestamp: '2026-01-02T03:00:00.000Z' }]);

    expect(getCryptoCandles).toHaveBeenCalledWith({
      symbol: 'BTC-USD',
      interval: '1h',
      start: '2026-01-02T00:00:00.000Z',
      end: '2026-01-02T23:59:59.999Z',
      order: 'asc',
      limit: 12,
    });
  });
});
