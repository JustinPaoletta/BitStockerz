import { Prisma, type PaperAutomation } from '@prisma/client';
import { AutomationService } from './automation.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AppConfigService } from '../config/app-config.service';
import type { StrategiesService } from '../strategies/strategies.service';
import type { MarketDataService } from '../market-data/market-data.service';
import type { OrdersService } from '../trading/orders.service';
import type { PaperAccountsService } from '../trading/paper-accounts.service';
import type { PositionsService } from '../trading/positions.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
const definition = {
  indicators: [],
  entry: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'gt', right: { literal: 0 } }],
  },
  exit: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'lt', right: { literal: 0 } }],
  },
  risk: {
    stop_loss: { type: 'percent', value: 5 },
    take_profit: { type: 'percent', value: 5 },
  },
};
function fixture(database = false) {
  const stored = new Map<string, PaperAutomation>();
  const repository = {
    findMany: jest.fn(
      ({ where }: { where: { userId?: string; status?: string } }) =>
        Promise.resolve(
          [...stored.values()]
            .filter(
              (r) =>
                (!where.userId || r.userId === where.userId) &&
                (!where.status || r.status === where.status),
            )
            .map((r) => ({
              ...r,
              stateJson: JSON.parse(
                JSON.stringify(r.stateJson),
              ) as Prisma.JsonValue,
            })),
        ),
    ),
    findFirst: jest.fn(({ where }: { where: { id: string; userId: string } }) =>
      Promise.resolve(
        stored.get(where.id)?.userId === where.userId
          ? stored.get(where.id)
          : null,
      ),
    ),
    create: jest.fn(({ data }: { data: PaperAutomation }) => {
      stored.set(data.id, { ...data });
      return Promise.resolve(data);
    }),
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<PaperAutomation>;
      }) => {
        const row = { ...stored.get(where.id)!, ...data };
        stored.set(row.id, row);
        return Promise.resolve(row);
      },
    ),
  };
  const prisma = { isEnabled: database, paperAutomation: repository };
  const config = { jobs: { schedulerEnabled: true } };
  const strategies = {
    resolveOwnedVersion: jest.fn().mockResolvedValue({
      assetType: 'EQUITY',
      timeframe: '1d',
      strategyVersionId: 7,
      definition,
    }),
  };
  const now = new Date('2026-08-03T12:00:00Z');
  const market = {
    lookupSymbol: jest
      .fn()
      .mockResolvedValue({ id: 1, symbol: 'AAPL', asset_type: 'EQUITY' }),
    requireActiveSymbolById: jest
      .fn()
      .mockResolvedValue({ id: 1, symbol: 'AAPL', asset_type: 'EQUITY' }),
    getLatestClose: jest.fn().mockResolvedValue({
      symbol_id: 1,
      symbol: 'AAPL',
      price: '100',
      as_of: '2026-08-01T00:00:00.000Z',
      interval: '1d',
    }),
    getBacktestBars: jest.fn().mockResolvedValue([
      {
        ts: new Date('2026-08-01'),
        open: 100,
        high: 100,
        low: 100,
        close: 100,
        volume: 1,
      },
    ]),
  };
  const orders = {
    findOwnedClientOrder: jest.fn().mockResolvedValue(null),
    placeMarketOrder: jest.fn().mockResolvedValue({
      order: {
        id: 'filled-1',
        status: 'FILLED',
        quantity: '10.00000000',
        avg_fill_price: '100.00000000',
      },
    }),
  };
  const accounts = {
    getForUser: jest
      .fn()
      .mockResolvedValue({ id: 1, cashBalance: new Prisma.Decimal(10000) }),
  };
  const positions = { find: jest.fn().mockResolvedValue(null) };
  const make = () =>
    new AutomationService(
      prisma as unknown as PrismaService,
      config as AppConfigService,
      strategies as unknown as StrategiesService,
      market as unknown as MarketDataService,
      orders as unknown as OrdersService,
      accounts as unknown as PaperAccountsService,
      positions as unknown as PositionsService,
    );
  const service = make();
  return {
    service,
    make,
    stored,
    repository,
    prisma,
    config,
    strategies,
    market,
    orders,
    accounts,
    positions,
    now,
  };
}
const input = {
  strategy_id: 'owned-strategy',
  symbol: 'AAPL',
  allocation_pct: 10,
};
describe('forward paper execution', () => {
  it.each([false, true])(
    'buys once per completed bar, exits at the latest close, and attributes P&L (database=%s)',
    async (database) => {
      const f = fixture(database),
        record = await f.service.create('u1', input);
      await f.service.control('u1', record.id, 'active');
      await Promise.all([
        f.service.evaluate('u1', record.id, f.now),
        f.service.evaluate('u1', record.id, f.now),
      ]);
      expect(f.orders.placeMarketOrder).toHaveBeenCalledTimes(1);
      expect(f.strategies.resolveOwnedVersion).toHaveBeenLastCalledWith(
        'u1',
        'owned-strategy',
        7,
      );
      expect(f.orders.placeMarketOrder.mock.calls[0]).toEqual([
        'u1',
        expect.objectContaining({
          quantity: '10.00000000',
          side: 'BUY',
          clientOrderId: expect.stringMatching(/^[a-f0-9]{64}$/),
          expectedClose: { asOf: '2026-08-01T00:00:00.000Z', interval: '1d' },
        }),
      ]);
      f.positions.find.mockResolvedValue({
        quantity: new Prisma.Decimal(10),
        avgCost: new Prisma.Decimal(100),
      });
      f.market.getLatestClose.mockResolvedValue({
        symbol_id: 1,
        symbol: 'AAPL',
        price: '110',
        as_of: '2026-08-02T00:00:00.000Z',
        interval: '1d',
      });
      f.market.getBacktestBars.mockResolvedValue([
        {
          ts: new Date('2026-08-02'),
          open: 110,
          high: 110,
          low: 110,
          close: 110,
          volume: 1,
        },
      ]);
      f.orders.placeMarketOrder.mockResolvedValue({
        order: {
          id: 'filled-2',
          status: 'FILLED',
          quantity: '10.00000000',
          avg_fill_price: '110.00000000',
        },
      });
      const sold = await f.service.evaluate('u1', record.id, f.now);
      expect(sold.stateJson).toMatchObject({
        quantity: '0',
        realized_pnl: '100.00000000',
        closed_trades: 1,
      });
      expect((await f.service.control('u1', record.id, 'stopped')).status).toBe(
        'stopped',
      );
      await expect(
        f.service.control('u1', record.id, 'active'),
      ).rejects.toThrow();
    },
  );
  it('recovers a committed order from durable intent after restart without placing another', async () => {
    const f = fixture(true),
      record = await f.service.create('u1', input);
    await f.service.control('u1', record.id, 'active');
    const durable = f.stored.get(record.id)!;
    durable.stateJson = {
      quantity: '0',
      entry_price: '0',
      realized_pnl: '0',
      closed_trades: 0,
      activity: [],
      pending: {
        side: 'BUY',
        quantity: '10.00000000',
        client_id: 'intent-1',
        bar: '2026-08-01T00:00:00.000Z',
      },
    };
    f.orders.findOwnedClientOrder.mockResolvedValue({
      id: 'prior-order',
      status: 'FILLED',
      quantity: '10.00000000',
      avg_fill_price: '100.00000000',
    });
    const after = await f.make().evaluate('u1', record.id, f.now);
    expect(after.stateJson).toMatchObject({
      quantity: '10.00000000',
      last_bar: '2026-08-01T00:00:00.000Z',
    });
    expect(f.orders.placeMarketOrder).not.toHaveBeenCalled();
  });
  it('pauses when an uncommitted pending signal has expired', async () => {
    const f = fixture(true),
      r = await f.service.create('u1', input);
    await f.service.control('u1', r.id, 'active');
    f.stored.get(r.id)!.stateJson = {
      quantity: '0',
      entry_price: '0',
      realized_pnl: '0',
      closed_trades: 0,
      activity: [],
      pending: {
        side: 'BUY',
        quantity: '10',
        client_id: 'intent-1',
        bar: '2026-07-30T00:00:00Z',
      },
    };
    const paused = await f.service.evaluate('u1', r.id, f.now);
    expect(paused.status).toBe('paused');
    expect(paused.stateJson).not.toHaveProperty('pending');
    expect(f.orders.placeMarketOrder).not.toHaveBeenCalled();
  });
  it.each(['stale', 'incomplete', 'interval', 'bars', 'position', 'provider'])(
    'fails closed for %s data/execution',
    async (cause) => {
      const f = fixture(),
        r = await f.service.create('u1', input);
      await f.service.control('u1', r.id, 'active');
      if (cause === 'stale')
        f.market.getLatestClose.mockRejectedValue(
          new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE),
        );
      if (cause === 'provider')
        f.market.getLatestClose.mockRejectedValue(
          new Error('secret-provider-error'),
        );
      if (cause === 'incomplete')
        f.market.getLatestClose.mockResolvedValue({
          symbol_id: 1,
          symbol: 'AAPL',
          price: '100',
          as_of: f.now.toISOString(),
          interval: '1d',
        });
      if (cause === 'interval')
        f.market.getLatestClose.mockResolvedValue({
          symbol_id: 1,
          symbol: 'AAPL',
          price: '100',
          as_of: '2026-08-01T00:00:00.000Z',
          interval: '1h',
        });
      if (cause === 'bars') f.market.getBacktestBars.mockResolvedValue([]);
      if (cause === 'position')
        f.positions.find.mockResolvedValue({ quantity: new Prisma.Decimal(2) });
      const paused = await f.service.evaluate('u1', r.id, f.now);
      expect(paused.status).toBe('paused');
      expect(f.orders.placeMarketOrder).not.toHaveBeenCalled();
      expect(JSON.stringify(paused.stateJson)).not.toContain(
        'secret-provider-error',
      );
    },
  );
  it('records risk rejection and no-signal evaluations without inventing held positions', async () => {
    const f = fixture(),
      r = await f.service.create('u1', input);
    expect((await f.service.evaluate('u1', r.id, f.now)).status).toBe('paused');
    await f.service.control('u1', r.id, 'active');
    f.orders.placeMarketOrder.mockResolvedValue({
      order: {
        id: 'rejected',
        status: 'REJECTED',
        quantity: '10',
        reject_reason: 'MAX_ORDER_NOTIONAL',
      },
    });
    expect(
      (await f.service.evaluate('u1', r.id, f.now)).stateJson,
    ).toMatchObject({
      quantity: '0',
      activity: expect.arrayContaining([
        expect.objectContaining({
          event: 'rejected',
          reason: 'MAX_ORDER_NOTIONAL',
        }),
      ]),
    });
    const g = fixture();
    g.strategies.resolveOwnedVersion.mockResolvedValue({
      assetType: 'EQUITY',
      timeframe: '1d',
      strategyVersionId: 7,
      definition: {
        ...definition,
        entry: {
          logic: 'AND',
          conditions: [
            { left: { price: 'close' }, op: 'gt', right: { literal: 1000 } },
          ],
        },
      },
    });
    const quiet = await g.service.create('u1', input);
    await g.service.control('u1', quiet.id, 'active');
    expect(
      (await g.service.evaluate('u1', quiet.id, g.now)).stateJson,
    ).toMatchObject({ last_bar: '2026-08-01T00:00:00.000Z' });
    expect(g.orders.placeMarketOrder).not.toHaveBeenCalled();
  });
  it('keeps existing positions and foreign IDs out of runner ownership', async () => {
    const f = fixture();
    f.positions.find.mockResolvedValue({ quantity: new Prisma.Decimal(1) });
    await expect(f.service.create('u1', input)).rejects.toThrow();
    f.positions.find.mockResolvedValue(null);
    f.market.lookupSymbol.mockResolvedValue({
      id: 1,
      symbol: 'BTC-USD',
      asset_type: 'CRYPTO',
    });
    await expect(f.service.create('u1', input)).rejects.toThrow();
    f.market.lookupSymbol.mockResolvedValue({
      id: 1,
      symbol: 'AAPL',
      asset_type: 'EQUITY',
    });
    const r = await f.service.create('u1', input);
    await expect(f.service.control('u2', r.id, 'active')).rejects.toThrow();
    await expect(f.service.create('u1', input)).rejects.toThrow();
    expect(await f.service.list('u2')).toHaveLength(0);
    f.service.forgetUser('u1');
    expect(await f.service.list('u1')).toHaveLength(0);
  });
  it('runs scheduled database evaluations once and disables the seed scheduler', async () => {
    const f = fixture(true),
      r = await f.service.create('u1', input);
    await f.service.control('u1', r.id, 'active');
    const spy = jest
      .spyOn(f.service, 'evaluate')
      .mockResolvedValue({ ...r, status: 'active' });
    await f.service.tick();
    expect(spy).toHaveBeenCalledWith('u1', r.id);
    f.config.jobs.schedulerEnabled = false;
    await f.service.tick();
    expect(spy).toHaveBeenCalledTimes(1);
    await fixture().service.tick();
  });
  it('rejects zero cash sizing and enforces the per-user runner cap', async () => {
    const f = fixture(),
      r = await f.service.create('u1', input);
    f.accounts.getForUser.mockResolvedValue({
      id: 1,
      cashBalance: new Prisma.Decimal(0),
    });
    await f.service.control('u1', r.id, 'active');
    expect((await f.service.evaluate('u1', r.id, f.now)).status).toBe('paused');
    expect(f.orders.placeMarketOrder).not.toHaveBeenCalled();
    const full = fixture(true);
    full.repository.findMany.mockResolvedValue(
      Array.from({ length: 20 }, () => r),
    );
    await expect(full.service.create('u1', input)).rejects.toThrow('20');
  });
  it('skips overlapping scheduler ticks and continues beyond one database page', async () => {
    const f = fixture(true),
      r = await f.service.create('u1', input);
    await f.service.control('u1', r.id, 'active');
    f.repository.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 50 }, (_, i) => ({ ...r, id: `r${i}` })),
      )
      .mockResolvedValueOnce([]);
    const evaluate = jest.spyOn(f.service, 'evaluate').mockResolvedValue(r);
    await Promise.all([f.service.tick(), f.service.tick()]);
    expect(evaluate).toHaveBeenCalledTimes(50);
    expect(f.repository.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: { id: 'r49' }, skip: 1 }),
    );
  });
  it('bounds the activity log while processing successive quiet bars', async () => {
    const f = fixture();
    f.strategies.resolveOwnedVersion.mockResolvedValue({
      assetType: 'EQUITY',
      timeframe: '1d',
      strategyVersionId: 7,
      definition: {
        ...definition,
        entry: {
          logic: 'AND',
          conditions: [
            { left: { price: 'close' }, op: 'gt', right: { literal: 1000 } },
          ],
        },
      },
    });
    const r = await f.service.create('u1', input);
    await f.service.control('u1', r.id, 'active');
    for (let i = 0; i < 102; i++) {
      const date = new Date(Date.UTC(2026, 0, i + 1));
      f.market.getLatestClose.mockResolvedValue({
        symbol_id: 1,
        symbol: 'AAPL',
        price: '100',
        as_of: date.toISOString(),
        interval: '1d',
      });
      f.market.getBacktestBars.mockResolvedValue([
        { ts: date, open: 100, high: 100, low: 100, close: 100, volume: 1 },
      ]);
      await f.service.evaluate('u1', r.id, f.now);
    }
    expect((await f.service.list('u1'))[0].stateJson).toMatchObject({
      activity: expect.any(Array),
    });
    expect(
      ((await f.service.list('u1'))[0].stateJson as { activity: unknown[] })
        .activity,
    ).toHaveLength(100);
  });

  it('executes an uncommitted durable intent once on the same bar and keeps unrelated reset state', async () => {
    const f = fixture(true),
      r = await f.service.create('u1', input);
    await f.service.control('u1', r.id, 'active');
    f.stored.get(r.id)!.stateJson = {
      quantity: '0',
      entry_price: '0',
      realized_pnl: '0',
      closed_trades: 0,
      activity: [],
      pending: {
        side: 'BUY',
        quantity: '10.00000000',
        client_id: 'durable-intent',
        bar: '2026-08-01T00:00:00.000Z',
      },
    };
    const evaluated = await f.make().evaluate('u1', r.id, f.now);
    expect(evaluated.stateJson).toMatchObject({ quantity: '10.00000000' });
    expect(f.orders.placeMarketOrder).toHaveBeenCalledTimes(1);
    const memory = fixture(),
      a = await memory.service.create('u1', input),
      b = await memory.service.create('u2', input);
    memory.service.stopMemoryForUser('u1');
    expect((await memory.service.list('u1'))[0].status).toBe('stopped');
    expect((await memory.service.list('u2'))[0].id).toBe(b.id);
    expect((await memory.service.list('u2'))[0].status).toBe('paused');
    memory.service.forgetUser('u1');
    expect(await memory.service.list('u1')).toHaveLength(0);
    expect(a.id).not.toBe(b.id);
  });
});
