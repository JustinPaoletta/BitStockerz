import { Prisma } from '@prisma/client';
import { TradingMemoryStore } from './trading-memory.store';

describe('TradingMemoryStore transactions', () => {
  it('rolls back account-scoped state on failure', async () => {
    const store = new TradingMemoryStore();
    const now = new Date();
    const account = {
      id: 1,
      userId: 'u1',
      name: 'Paper Account',
      baseCurrency: 'USD',
      startingBalance: new Prisma.Decimal(100),
      cashBalance: new Prisma.Decimal(100),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    store.paperAccountsById.set(1, account);
    store.paperAccountsByUserId.set('u1', account);
    store.positionsByKey.set('1:1', {
      id: 1,
      paperAccountId: 1,
      symbolId: 1,
      quantity: new Prisma.Decimal(2),
      avgCost: new Prisma.Decimal(10),
      updatedAt: now,
    });
    store.positionsByKey.set('2:2', {
      id: 20,
      paperAccountId: 2,
      symbolId: 2,
      quantity: new Prisma.Decimal(1),
      avgCost: new Prisma.Decimal(20),
      updatedAt: now,
    });
    store.ordersById.set('order-1', {
      id: 'order-1',
      paperAccountId: 1,
      symbolId: 1,
      side: 'BUY',
      quantity: new Prisma.Decimal(2),
      orderType: 'MARKET',
      status: 'FILLED',
      avgFillPrice: new Prisma.Decimal(10),
      rejectReason: null,
      clientOrderId: 'client-1',
      requestedAt: now,
      filledAt: now,
    });
    store.orderIdsByClientKey.set('1:client-1', 'order-1');
    store.ordersById.set('order-without-client', {
      ...store.ordersById.get('order-1')!,
      id: 'order-without-client',
      clientOrderId: null,
    });
    store.ordersById.set('unrelated-order', {
      ...store.ordersById.get('order-1')!,
      id: 'unrelated-order',
      paperAccountId: 2,
    });
    store.executionsById.set('execution-1', {
      id: 'execution-1',
      orderId: 'order-1',
      paperAccountId: 1,
      symbolId: 1,
      side: 'BUY',
      quantity: new Prisma.Decimal(2),
      price: new Prisma.Decimal(10),
      executedAt: now,
    });
    store.executionsById.set('unrelated-execution', {
      ...store.executionsById.get('execution-1')!,
      id: 'unrelated-execution',
      paperAccountId: 2,
    });

    await expect(
      store.runAccountTransaction(1, async () => {
        store.paperAccountsById.set(1, {
          ...account,
          userId: 'temporary-user',
          cashBalance: new Prisma.Decimal(0),
        });
        store.paperAccountsByUserId.set(
          'temporary-user',
          store.paperAccountsById.get(1)!,
        );
        store.positionsByKey.delete('1:1');
        store.positionsByKey.set('1:2', {
          id: 2,
          paperAccountId: 1,
          symbolId: 2,
          quantity: new Prisma.Decimal(1),
          avgCost: new Prisma.Decimal(20),
          updatedAt: now,
        });
        store.ordersById.delete('order-1');
        store.orderIdsByClientKey.delete('1:client-1');
        store.ordersById.set('order-2', {
          id: 'order-2',
          paperAccountId: 1,
          symbolId: 2,
          side: 'SELL',
          quantity: new Prisma.Decimal(1),
          orderType: 'MARKET',
          status: 'REJECTED',
          avgFillPrice: null,
          rejectReason: 'INSUFFICIENT_POSITION',
          clientOrderId: null,
          requestedAt: now,
          filledAt: null,
        });
        store.executionsById.delete('execution-1');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(store.paperAccountsById.get(1)?.cashBalance.toFixed(2)).toBe(
      '100.00',
    );
    expect(store.paperAccountsByUserId.has('temporary-user')).toBe(false);
    expect(store.positionsByKey.get('1:1')?.quantity.toFixed(2)).toBe('2.00');
    expect(store.positionsByKey.has('1:2')).toBe(false);
    expect(store.positionsByKey.has('2:2')).toBe(true);
    expect(store.ordersById.has('order-1')).toBe(true);
    expect(store.ordersById.has('order-without-client')).toBe(true);
    expect(store.ordersById.has('unrelated-order')).toBe(true);
    expect(store.ordersById.has('order-2')).toBe(false);
    expect(store.orderIdsByClientKey.get('1:client-1')).toBe('order-1');
    expect(store.executionsById.has('execution-1')).toBe(true);
    expect(store.executionsById.has('unrelated-execution')).toBe(true);
  });

  it('removes state created for a previously missing account on rollback', async () => {
    const store = new TradingMemoryStore();
    const now = new Date();

    await expect(
      store.runAccountTransaction(9, async () => {
        const created = {
          id: 9,
          userId: 'u9',
          name: 'Paper Account',
          baseCurrency: 'USD',
          startingBalance: new Prisma.Decimal(100),
          cashBalance: new Prisma.Decimal(100),
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        store.paperAccountsById.set(9, created);
        store.paperAccountsByUserId.set('u9', created);
        throw new Error('rollback create');
      }),
    ).rejects.toThrow('rollback create');

    expect(store.paperAccountsById.has(9)).toBe(false);
    expect(store.paperAccountsByUserId.has('u9')).toBe(false);
  });

  it('serializes concurrent work for the same account', async () => {
    const store = new TradingMemoryStore();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = store.runAccountTransaction(1, async () => {
      events.push('first-start');
      await firstGate;
      events.push('first-end');
    });
    const second = store.runAccountTransaction(1, async () => {
      events.push('second');
    });
    await Promise.resolve();
    expect(events).toEqual(['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });

  it('allocates deterministic ids and resets all seed state', () => {
    const store = new TradingMemoryStore();
    expect(store.allocatePaperAccountId()).toBe(1);
    expect(store.allocatePositionId()).toBe(1);
    expect(store.positionKey(1, 2)).toBe('1:2');
    expect(store.clientOrderKey(1, 'abc')).toBe('1:abc');
    store.ordersById.set('unrelated', {} as never);

    store.resetForTests();

    expect(store.allocatePaperAccountId()).toBe(1);
    expect(store.allocatePositionId()).toBe(1);
    expect(store.ordersById.size).toBe(0);
  });
});
