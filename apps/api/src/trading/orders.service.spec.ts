import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { MarketDataService } from '../market-data/market-data.service';
import type { AuditService } from '../observability/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { FillPriceService } from './fill-price.service';
import type { OrderRiskService } from './order-risk.service';
import { OrdersService } from './orders.service';
import type { PaperAccountsService } from './paper-accounts.service';
import type { PositionsService } from './positions.service';
import type { TradingLedgerService } from './trading-ledger.service';
import { TradingMemoryStore } from './trading-memory.store';

const now = new Date('2026-08-02T00:00:00.000Z');
const account = {
  id: 7,
  userId: 'user-1',
  name: 'Paper Account',
  baseCurrency: 'USD',
  startingBalance: new Prisma.Decimal('100000'),
  cashBalance: new Prisma.Decimal('100000'),
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const symbol = {
  id: 1,
  symbol: 'AAPL',
  name: 'Apple',
  asset_type: 'EQUITY' as const,
  currency: 'USD',
  is_active: true,
};

function orderRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    paperAccountId: account.id,
    symbolId: symbol.id,
    side: 'BUY',
    quantity: new Prisma.Decimal('1'),
    orderType: 'MARKET',
    status: 'FILLED',
    avgFillPrice: new Prisma.Decimal('100'),
    rejectReason: null,
    clientOrderId: null,
    requestedAt: now,
    filledAt: now,
    ...overrides,
  };
}

function createHarness() {
  const txOrderFind = jest.fn().mockResolvedValue(null);
  const txOrderCreate = jest.fn().mockImplementation(({ data }) =>
    Promise.resolve(
      orderRecord({
        ...data,
        status: 'PENDING',
        avgFillPrice: null,
        rejectReason: null,
        filledAt: null,
      }),
    ),
  );
  const txOrderUpdate = jest
    .fn()
    .mockImplementation(({ data }) => Promise.resolve(orderRecord(data)));
  const txExecutionCreate = jest.fn().mockResolvedValue({});
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: account.id }]),
    paperAccount: { findUnique: jest.fn().mockResolvedValue(account) },
    order: {
      findUnique: txOrderFind,
      create: txOrderCreate,
      update: txOrderUpdate,
    },
    execution: { create: txExecutionCreate },
  };
  const prismaOrderFind = jest.fn().mockResolvedValue(null);
  const prismaOrderList = jest.fn().mockResolvedValue([]);
  const prismaExecutionList = jest.fn().mockResolvedValue([]);
  const transaction = jest.fn(async (fn) =>
    (fn as (client: typeof tx) => Promise<unknown>)(tx),
  );
  const prisma = {
    isEnabled: true,
    order: { findUnique: prismaOrderFind, findMany: prismaOrderList },
    execution: { findMany: prismaExecutionList },
    $transaction: transaction,
  } as unknown as PrismaService;
  const accounts = {
    getForUser: jest.fn().mockResolvedValue(account),
  } as unknown as PaperAccountsService;
  const positions = {
    listForAccount: jest.fn().mockResolvedValue([]),
  } as unknown as PositionsService;
  const ledger = {
    applyFill: jest.fn().mockResolvedValue({}),
  } as unknown as TradingLedgerService;
  const prices = {
    getLatestClose: jest.fn().mockResolvedValue({
      symbolId: 1,
      symbol: 'AAPL',
      price: new Prisma.Decimal('100'),
      asOf: now,
      interval: '1d',
    }),
    getLatestClosesByIds: jest.fn().mockResolvedValue(new Map()),
  } as unknown as FillPriceService;
  const risk = {
    evaluate: jest.fn().mockReturnValue(null),
  } as unknown as OrderRiskService;
  const marketData = {
    lookupSymbol: jest.fn().mockResolvedValue(symbol),
    getSymbolsByIds: jest.fn().mockResolvedValue([symbol]),
  } as unknown as MarketDataService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const service = new OrdersService(
    prisma,
    accounts,
    positions,
    ledger,
    prices,
    risk,
    marketData,
    new TradingMemoryStore(),
    audit,
  );
  return {
    service,
    prisma,
    accounts,
    positions,
    ledger,
    prices,
    risk,
    marketData,
    audit,
    tx,
    transaction,
    txOrderFind,
    txOrderCreate,
    txOrderUpdate,
    txExecutionCreate,
    prismaOrderFind,
    prismaOrderList,
    prismaExecutionList,
  };
}

function createSeedHarness() {
  const memory = new TradingMemoryStore();
  memory.paperAccountsById.set(account.id, account);
  memory.paperAccountsByUserId.set(account.userId, account);
  const accounts = {
    getForUser: jest.fn().mockResolvedValue(account),
  } as unknown as PaperAccountsService;
  const positions = {
    listForAccount: jest.fn().mockResolvedValue([]),
  } as unknown as PositionsService;
  const ledger = {
    applyFill: jest.fn().mockResolvedValue({}),
  } as unknown as TradingLedgerService;
  const prices = {
    getLatestClose: jest.fn().mockResolvedValue({
      symbolId: 1,
      symbol: 'AAPL',
      price: new Prisma.Decimal('100'),
      asOf: now,
      interval: '1d',
    }),
    getLatestClosesByIds: jest.fn().mockResolvedValue(new Map()),
  } as unknown as FillPriceService;
  const risk = {
    evaluate: jest.fn().mockReturnValue(null),
  } as unknown as OrderRiskService;
  const marketData = {
    lookupSymbol: jest.fn().mockResolvedValue(symbol),
    getSymbolsByIds: jest.fn().mockResolvedValue([]),
  } as unknown as MarketDataService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;
  const service = new OrdersService(
    { isEnabled: false } as PrismaService,
    accounts,
    positions,
    ledger,
    prices,
    risk,
    marketData,
    memory,
    audit,
  );
  return { service, memory, accounts, ledger, marketData, audit };
}

describe('OrdersService Prisma path', () => {
  it('locks, fills, executes, audits, and returns fixed decimals', async () => {
    const harness = createHarness();
    const result = await harness.service.placeMarketOrder('user-1', {
      symbol: 'aapl',
      side: 'BUY',
      quantity: '1',
    });

    expect(result.order).toMatchObject({
      symbol: 'AAPL',
      status: 'FILLED',
      quantity: '1.00000000',
      avg_fill_price: '100.00000000',
    });
    expect(harness.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
    expect(harness.tx.$queryRaw).toHaveBeenCalled();
    expect(harness.ledger.applyFill).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 7, symbolId: 1 }),
      harness.tx,
    );
    expect(harness.txExecutionCreate).toHaveBeenCalled();
    expect(harness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trading.order_filled' }),
    );
  });

  it('persists risk and missing-price rejections without an execution', async () => {
    const riskHarness = createHarness();
    (riskHarness.risk.evaluate as jest.Mock).mockReturnValue(
      'MAX_ORDER_NOTIONAL',
    );
    await expect(
      riskHarness.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1000',
      }),
    ).resolves.toMatchObject({
      order: { status: 'REJECTED', reject_reason: 'MAX_ORDER_NOTIONAL' },
    });
    expect(riskHarness.txExecutionCreate).not.toHaveBeenCalled();
    expect(riskHarness.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'trading.order_rejected' }),
    );

    const priceHarness = createHarness();
    (priceHarness.prices.getLatestClose as jest.Mock).mockRejectedValue(
      new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE),
    );
    await expect(
      priceHarness.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).resolves.toMatchObject({
      order: { status: 'REJECTED', reject_reason: 'NO_MARKET_PRICE' },
    });
  });

  it.each([
    [ErrorCode.TRADING_INSUFFICIENT_CASH, 'INSUFFICIENT_CASH'],
    [ErrorCode.TRADING_INSUFFICIENT_POSITION, 'INSUFFICIENT_POSITION'],
  ])('persists ledger %s as %s', async (code, reason) => {
    const harness = createHarness();
    (harness.ledger.applyFill as jest.Mock).mockRejectedValue(
      new DomainError(code),
    );
    await expect(
      harness.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).resolves.toMatchObject({
      order: { status: 'REJECTED', reject_reason: reason },
    });
  });

  it('returns an in-transaction idempotent replay without filling', async () => {
    const harness = createHarness();
    harness.txOrderFind.mockResolvedValue(
      orderRecord({ clientOrderId: 'same-key' }),
    );
    const result = await harness.service.placeMarketOrder('user-1', {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1.0',
      clientOrderId: 'same-key',
    });
    expect(result.order.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(harness.txOrderCreate).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
  });

  it('recovers unique races and retries serializable conflicts', async () => {
    const unique = createHarness();
    (unique.transaction as jest.Mock).mockRejectedValue({ code: 'P2002' });
    unique.prismaOrderFind
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(orderRecord({ clientOrderId: 'race-key' }));
    await expect(
      unique.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
        clientOrderId: 'race-key',
      }),
    ).resolves.toMatchObject({ order: { client_order_id: 'race-key' } });

    const conflict = createHarness();
    const execute = conflict.transaction as jest.Mock;
    execute
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockImplementationOnce(async (fn) => fn(conflict.tx));
    await conflict.service.placeMarketOrder('user-1', {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1',
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('rejects inactive accounts and propagates unexpected price/ledger errors', async () => {
    const inactive = createHarness();
    (inactive.accounts.getForUser as jest.Mock).mockResolvedValue({
      ...account,
      isActive: false,
    });
    await expect(
      inactive.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TRADING_ACCOUNT_INACTIVE });

    const price = createHarness();
    (price.prices.getLatestClose as jest.Mock).mockRejectedValue(
      new Error('price database failed'),
    );
    await expect(
      price.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toThrow('price database failed');

    const ledger = createHarness();
    (ledger.ledger.applyFill as jest.Mock).mockRejectedValue(
      new Error('ledger database failed'),
    );
    await expect(
      ledger.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toThrow('ledger database failed');

    const changedDuringTransaction = createHarness();
    changedDuringTransaction.tx.paperAccount.findUnique.mockResolvedValue({
      ...account,
      isActive: false,
    });
    await expect(
      changedDuringTransaction.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TRADING_ACCOUNT_INACTIVE });
  });

  it('lists filtered Prisma orders and executions with has_more', async () => {
    const harness = createHarness();
    harness.prismaOrderList.mockResolvedValue([
      { ...orderRecord(), symbol: { symbol: 'AAPL' } },
      {
        ...orderRecord({ id: '22222222-2222-4222-8222-222222222222' }),
        symbol: { symbol: 'AAPL' },
      },
    ]);
    harness.prismaExecutionList.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        orderId: '11111111-1111-4111-8111-111111111111',
        paperAccountId: 7,
        symbolId: 1,
        side: 'BUY',
        quantity: new Prisma.Decimal('1'),
        price: new Prisma.Decimal('100'),
        executedAt: now,
        symbol: { symbol: 'AAPL' },
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        orderId: '22222222-2222-4222-8222-222222222222',
        paperAccountId: 7,
        symbolId: 1,
        side: 'SELL',
        quantity: new Prisma.Decimal('0.5'),
        price: new Prisma.Decimal('110'),
        executedAt: now,
        symbol: { symbol: 'AAPL' },
      },
    ]);

    await expect(
      harness.service.listOrders('user-1', {
        status: 'FILLED',
        symbol: 'AAPL',
        limit: 1,
        offset: 2,
      }),
    ).resolves.toMatchObject({ limit: 1, offset: 2, has_more: true });
    await expect(
      harness.service.listExecutions('user-1', {
        symbol: 'AAPL',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      executions: [
        expect.objectContaining({ notional: '100.00', side: 'BUY' }),
      ],
      has_more: true,
    });
  });

  it('lists unfiltered Prisma history without resolving a symbol', async () => {
    const harness = createHarness();

    await expect(
      harness.service.listOrders('user-1', {
        limit: 50,
        offset: 0,
      }),
    ).resolves.toEqual({ orders: [], limit: 50, offset: 0, has_more: false });
    await expect(
      harness.service.listExecutions('user-1', {
        limit: 100,
        offset: 0,
      }),
    ).resolves.toEqual({
      executions: [],
      limit: 100,
      offset: 0,
      has_more: false,
    });
    expect(harness.marketData.lookupSymbol).not.toHaveBeenCalled();
    expect(harness.prismaOrderList).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paperAccountId: 7 } }),
    );
    expect(harness.prismaExecutionList).toHaveBeenCalledWith(
      expect.objectContaining({ where: { paperAccountId: 7 } }),
    );
  });

  it('fails risk closed for missing or failed held-symbol prices', async () => {
    const missing = createHarness();
    (missing.positions.listForAccount as jest.Mock).mockResolvedValue([
      {
        id: 1,
        paperAccountId: 7,
        symbolId: 2,
        quantity: new Prisma.Decimal('1'),
        avgCost: new Prisma.Decimal('10'),
        updatedAt: now,
      },
    ]);
    await expect(
      missing.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).resolves.toMatchObject({
      order: { reject_reason: 'NO_MARKET_PRICE' },
    });

    const failed = createHarness();
    (failed.prices.getLatestClosesByIds as jest.Mock).mockRejectedValue(
      new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE),
    );
    await expect(
      failed.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).resolves.toMatchObject({
      order: { reject_reason: 'NO_MARKET_PRICE' },
    });

    const unexpected = createHarness();
    (unexpected.prices.getLatestClosesByIds as jest.Mock).mockRejectedValue(
      new Error('batch pricing failed'),
    );
    await expect(
      unexpected.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toThrow('batch pricing failed');
  });
});

describe('OrdersService seed transaction edge cases', () => {
  it('uses deterministic tie-breakers and UNKNOWN history fallbacks', async () => {
    const harness = createSeedHarness();
    for (const id of ['order-b', 'order-a']) {
      harness.memory.ordersById.set(id, orderRecord({ id }));
    }
    for (const id of ['execution-b', 'execution-a']) {
      harness.memory.executionsById.set(id, {
        id,
        orderId: 'order-a',
        paperAccountId: account.id,
        symbolId: symbol.id,
        side: 'BUY',
        quantity: new Prisma.Decimal('1'),
        price: new Prisma.Decimal('100'),
        executedAt: now,
      });
    }

    const orders = await harness.service.listOrders('user-1', {
      limit: 10,
      offset: 0,
    });
    const executions = await harness.service.listExecutions('user-1', {
      limit: 10,
      offset: 0,
    });

    expect(orders.orders.map((item) => item.id)).toEqual([
      'order-a',
      'order-b',
    ]);
    expect(orders.orders[0].symbol).toBe('UNKNOWN');
    expect(executions.executions.map((item) => item.symbol)).toEqual([
      'UNKNOWN',
      'UNKNOWN',
    ]);
  });

  it('detects an account deactivation after entering the seed lock', async () => {
    const harness = createSeedHarness();
    jest
      .spyOn(harness.memory, 'runAccountTransaction')
      .mockImplementation(async (_accountId, work) => {
        harness.memory.paperAccountsById.set(account.id, {
          ...account,
          isActive: false,
        });
        return work();
      });

    await expect(
      harness.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.TRADING_ACCOUNT_INACTIVE });
  });

  it('returns a replay created between the fast check and seed lock', async () => {
    const harness = createSeedHarness();
    const replay = orderRecord({ clientOrderId: 'raced-client' });
    jest
      .spyOn(harness.memory, 'runAccountTransaction')
      .mockImplementation(async (_accountId, work) => {
        harness.memory.ordersById.set(replay.id, replay);
        harness.memory.orderIdsByClientKey.set(
          harness.memory.clientOrderKey(account.id, 'raced-client'),
          replay.id,
        );
        return work();
      });

    const result = await harness.service.placeMarketOrder('user-1', {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1',
      clientOrderId: 'raced-client',
    });
    expect(result.order.id).toBe(replay.id);
    expect(harness.ledger.applyFill).not.toHaveBeenCalled();
    expect(harness.audit.record).not.toHaveBeenCalled();
  });

  it('persists expected seed ledger rejections', async () => {
    const harness = createSeedHarness();
    (harness.ledger.applyFill as jest.Mock).mockRejectedValue(
      new DomainError(ErrorCode.TRADING_INSUFFICIENT_CASH),
    );

    await expect(
      harness.service.placeMarketOrder('user-1', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: '1',
      }),
    ).resolves.toMatchObject({
      order: { status: 'REJECTED', reject_reason: 'INSUFFICIENT_CASH' },
    });
  });
});
