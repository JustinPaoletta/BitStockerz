import { Prisma } from '@prisma/client';
import type { AppConfigService } from '../config/app-config.service';
import { OrderRiskService } from './order-risk.service';

const config = {
  trading: {
    paperStartingBalance: '100000.00',
    maxOrderNotional: '25000',
    maxPositionPct: '25',
    minCashRemaining: '100',
  },
} as AppConfigService;

function value(input: string) {
  return new Prisma.Decimal(input);
}

describe('OrderRiskService', () => {
  const service = new OrderRiskService(config);
  const base = {
    side: 'BUY' as const,
    quantity: value('10'),
    price: value('100'),
    cashBalance: value('100000'),
    currentPositionQuantity: value('0'),
    preTradeEquity: value('100000'),
  };

  it('accepts a buy within every configured limit', () => {
    expect(service.evaluate(base)).toBeNull();
  });

  it.each([
    [{ quantity: value('251'), price: value('100') }, 'MAX_ORDER_NOTIONAL'],
    [{ cashBalance: value('999') }, 'INSUFFICIENT_CASH'],
    [{ cashBalance: value('1050') }, 'MIN_CASH_REMAINING'],
    [
      {
        quantity: value('251'),
        price: value('1'),
        preTradeEquity: value('1000'),
      },
      'MAX_POSITION_PCT',
    ],
    [{ preTradeEquity: value('0') }, 'MAX_POSITION_PCT'],
  ])('rejects BUY risk case as %s', (overrides, reason) => {
    expect(service.evaluate({ ...base, ...overrides })).toBe(reason);
  });

  it('rejects a sell that exceeds the held position', () => {
    expect(
      service.evaluate({
        ...base,
        side: 'SELL',
        quantity: value('2'),
        currentPositionQuantity: value('1'),
      }),
    ).toBe('INSUFFICIENT_POSITION');
  });

  it('accepts a sell at the exact position boundary', () => {
    expect(
      service.evaluate({
        ...base,
        side: 'SELL',
        quantity: value('1'),
        currentPositionQuantity: value('1'),
      }),
    ).toBeNull();
  });
});
