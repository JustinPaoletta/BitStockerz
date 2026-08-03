import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { MarketDataService } from '../market-data/market-data.service';
import type { FillPriceService } from './fill-price.service';
import type { PaperAccountsService } from './paper-accounts.service';
import type { PositionsService } from './positions.service';
import { TradingViewsService } from './trading-views.service';

const account = {
  id: 7,
  userId: 'user-1',
  name: 'Paper Account',
  baseCurrency: 'USD',
  startingBalance: new Prisma.Decimal('100000'),
  cashBalance: new Prisma.Decimal('1000'),
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const positions = [
  {
    id: 2,
    paperAccountId: 7,
    symbolId: 2,
    quantity: new Prisma.Decimal('2'),
    avgCost: new Prisma.Decimal('75'),
    updatedAt: new Date(),
  },
  {
    id: 1,
    paperAccountId: 7,
    symbolId: 1,
    quantity: new Prisma.Decimal('1'),
    avgCost: new Prisma.Decimal('80'),
    updatedAt: new Date(),
  },
];

function createViews(overrides?: {
  positions?: typeof positions;
  symbols?: Array<{ id: number; symbol: string }>;
  closes?: Map<number, Prisma.Decimal>;
  priceError?: unknown;
}) {
  const accounts = {
    getForUser: jest.fn().mockResolvedValue(account),
  } as unknown as PaperAccountsService;
  const positionService = {
    listForAccount: jest.fn().mockResolvedValue(overrides?.positions ?? []),
  } as unknown as PositionsService;
  const getLatestClosesByIds = overrides?.priceError
    ? jest.fn().mockRejectedValue(overrides.priceError)
    : jest.fn().mockResolvedValue(overrides?.closes ?? new Map());
  const prices = { getLatestClosesByIds } as unknown as FillPriceService;
  const marketData = {
    getSymbolsByIds: jest.fn().mockResolvedValue(overrides?.symbols ?? []),
  } as unknown as MarketDataService;
  return {
    service: new TradingViewsService(
      accounts,
      positionService,
      prices,
      marketData,
    ),
    prices,
  };
}

describe('TradingViewsService', () => {
  it('returns stable position ordering and an UNKNOWN fallback', async () => {
    const { service } = createViews({
      positions,
      symbols: [{ id: 2, symbol: 'AAPL' }],
    });

    await expect(service.listPositions('user-1')).resolves.toEqual({
      positions: [
        { symbol: 'AAPL', quantity: '2.00000000', avg_cost: '75.00000000' },
        {
          symbol: 'UNKNOWN',
          quantity: '1.00000000',
          avg_cost: '80.00000000',
        },
      ],
    });

    const tie = createViews({ positions, symbols: [] });
    const tied = await tie.service.listPositions('user-1');
    expect(tied.positions.map((item) => item.quantity)).toEqual([
      '1.00000000',
      '2.00000000',
    ]);
  });

  it('marks positions to market and returns zero totals when empty', async () => {
    const empty = createViews();
    await expect(empty.service.getPortfolioSummary('user-1')).resolves.toEqual({
      cash_balance: '1000.00',
      total_position_value: '0.00',
      total_equity: '1000.00',
      unrealized_pnl_total: '0.00',
    });

    const marked = createViews({
      positions,
      closes: new Map([
        [1, new Prisma.Decimal('100')],
        [2, new Prisma.Decimal('50')],
      ]),
    });
    await expect(marked.service.getPortfolioSummary('user-1')).resolves.toEqual(
      {
        cash_balance: '1000.00',
        total_position_value: '200.00',
        total_equity: '1200.00',
        unrealized_pnl_total: '-30.00',
      },
    );
  });

  it('fails closed when a held-symbol close is absent', async () => {
    const { service } = createViews({ positions, closes: new Map() });
    await expect(service.getPortfolioSummary('user-1')).rejects.toMatchObject({
      code: ErrorCode.TRADING_NO_MARKET_PRICE,
    });
  });

  it.each([ErrorCode.NOT_FOUND, ErrorCode.TRADING_NO_MARKET_PRICE])(
    'normalizes %s price lookup failures',
    async (code) => {
      const { service } = createViews({
        positions,
        priceError: new DomainError(code),
      });
      await expect(service.getPortfolioSummary('user-1')).rejects.toMatchObject(
        { code: ErrorCode.TRADING_NO_MARKET_PRICE },
      );
    },
  );

  it('preserves unexpected pricing failures', async () => {
    const failure = new Error('pricing backend failed');
    const { service } = createViews({ positions, priceError: failure });
    await expect(service.getPortfolioSummary('user-1')).rejects.toBe(failure);
  });
});
