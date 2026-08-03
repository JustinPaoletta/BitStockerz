import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { MarketDataService } from '../market-data/market-data.service';
import { FillPriceService } from './fill-price.service';

describe('FillPriceService', () => {
  it('converts a latest close into typed fill values', async () => {
    const marketData = {
      getLatestClose: jest.fn().mockResolvedValue({
        symbol_id: 1,
        symbol: 'AAPL',
        price: '199.125',
        as_of: '2026-08-02T14:00:00.000Z',
        interval: '1d',
      }),
    } as unknown as MarketDataService;
    const service = new FillPriceService(marketData);

    await expect(service.getLatestClose('AAPL')).resolves.toMatchObject({
      symbolId: 1,
      symbol: 'AAPL',
      interval: '1d',
    });
    const close = await service.getLatestClose('AAPL');
    expect(close.price.toFixed(3)).toBe('199.125');
    expect(close.asOf.toISOString()).toBe('2026-08-02T14:00:00.000Z');
  });

  it('converts batch prices to decimals', async () => {
    const marketData = {
      getLatestClosesByIds: jest.fn().mockResolvedValue(
        new Map([
          [
            1,
            {
              symbol_id: 1,
              symbol: 'AAPL',
              price: '199.125',
              as_of: '2026-08-02T14:00:00.000Z',
              interval: '1d',
            },
          ],
        ]),
      ),
    } as unknown as MarketDataService;
    const service = new FillPriceService(marketData);

    const closes = await service.getLatestClosesByIds([1]);
    expect(closes.get(1)?.toFixed(3)).toBe('199.125');
  });

  it('maps an unavailable symbol to the trading price error', async () => {
    const marketData = {
      getLatestClosesByIds: jest
        .fn()
        .mockRejectedValue(new DomainError(ErrorCode.NOT_FOUND)),
    } as unknown as MarketDataService;
    const service = new FillPriceService(marketData);

    await expect(service.getLatestClosesByIds([999])).rejects.toMatchObject({
      code: ErrorCode.TRADING_NO_MARKET_PRICE,
    });
  });

  it('preserves unexpected market-data failures', async () => {
    const failure = new Error('provider failed');
    const marketData = {
      getLatestClosesByIds: jest.fn().mockRejectedValue(failure),
    } as unknown as MarketDataService;
    const service = new FillPriceService(marketData);

    await expect(service.getLatestClosesByIds([1])).rejects.toBe(failure);
  });
});
