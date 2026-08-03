import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { PrismaService } from '../prisma/prisma.service';
import { PositionsService } from './positions.service';
import { TradingMemoryStore } from './trading-memory.store';

describe('PositionsService seed mode', () => {
  let memory: TradingMemoryStore;
  let service: PositionsService;

  beforeEach(() => {
    memory = new TradingMemoryStore();
    service = new PositionsService(
      { isEnabled: false } as PrismaService,
      memory,
    );
  });

  it('opens and adds with a weighted 8dp average cost', async () => {
    await service.applyBuy(1, 1, '1.5', '10.123456789');
    const result = await service.applyBuy(1, 1, '0.5', '20');

    expect(result.quantity.toFixed(8)).toBe('2.00000000');
    expect(result.avgCost.toFixed(8)).toBe('12.59259259');
  });

  it('reduces without changing average and deletes at zero', async () => {
    const opened = await service.applyBuy(1, 1, '2.25', '11.25');
    const reduced = await service.applySell(1, 1, '1.25', '50');
    expect(reduced?.quantity.toFixed(8)).toBe('1.00000000');
    expect(reduced?.avgCost.eq(opened.avgCost)).toBe(true);

    await expect(service.applySell(1, 1, '1', '50')).resolves.toBeNull();
    await expect(service.find(1, 1)).resolves.toBeNull();
  });

  it('rejects a sell beyond the long position', async () => {
    await service.applyBuy(1, 1, '1', '10');
    await expect(
      service.applySell(1, 1, '1.00000001', '10'),
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCode.TRADING_INSUFFICIENT_POSITION,
    });
  });

  it('lists only non-zero account positions in id order', async () => {
    await service.applyBuy(2, 2, new Prisma.Decimal('1'), '10');
    await service.applyBuy(1, 3, '1', '10');
    await service.applyBuy(1, 1, '1', '10');
    const positions = await service.listForAccount(1);
    expect(positions.map((item) => item.symbolId)).toEqual([3, 1]);
  });
});

describe('PositionsService database mode', () => {
  const position = (quantity: string, avgCost = '10', id = 11) => ({
    id,
    paperAccountId: 1,
    symbolId: 2,
    quantity: new Prisma.Decimal(quantity),
    avgCost: new Prisma.Decimal(avgCost),
    updatedAt: new Date('2026-08-02T00:00:00.000Z'),
  });

  it('opens a position in a standalone Prisma transaction', async () => {
    const created = position('2', '12');
    const tx = {
      position: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue(created),
      },
    };
    const prisma = {
      isEnabled: true,
      $transaction: jest.fn(
        async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const service = new PositionsService(prisma, new TradingMemoryStore());

    await expect(service.applyBuy(1, 2, '2', '12')).resolves.toBe(created);
    expect(tx.position.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          paperAccountId_symbolId: { paperAccountId: 1, symbolId: 2 },
        },
        create: expect.objectContaining({
          quantity: expect.any(Prisma.Decimal),
          avgCost: expect.any(Prisma.Decimal),
        }),
      }),
    );
  });

  it('updates a weighted average through a caller transaction', async () => {
    const existing = position('2', '10');
    const updated = position('3', '20');
    const tx = {
      position: {
        findUnique: jest.fn().mockResolvedValue(existing),
        upsert: jest.fn().mockResolvedValue(updated),
      },
    };
    const service = new PositionsService(
      { isEnabled: true } as PrismaService,
      new TradingMemoryStore(),
    );

    await service.applyBuy(1, 2, '1', '40', tx as never);

    const call = tx.position.upsert.mock.calls[0][0];
    expect(call.update.quantity.toFixed(8)).toBe('3.00000000');
    expect(call.update.avgCost.toFixed(8)).toBe('20.00000000');
  });

  it('updates or deletes a database position for sells', async () => {
    const existing = position('2.5', '10');
    const reduced = position('1.5', '10');
    const tx = {
      position: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(reduced),
        delete: jest.fn().mockResolvedValue(existing),
      },
    };
    const service = new PositionsService(
      { isEnabled: true } as PrismaService,
      new TradingMemoryStore(),
    );

    await expect(service.applySell(1, 2, '1', '99', tx as never)).resolves.toBe(
      reduced,
    );
    expect(tx.position.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: expect.objectContaining({ quantity: expect.any(Prisma.Decimal) }),
    });

    tx.position.findUnique.mockResolvedValueOnce(position('1'));
    await expect(
      service.applySell(1, 2, '1', '99', tx as never),
    ).resolves.toBeNull();
    expect(tx.position.delete).toHaveBeenCalledWith({ where: { id: 11 } });
  });

  it('reads database positions with account scoping', async () => {
    const records = [position('1')];
    const findMany = jest.fn().mockResolvedValue(records);
    const findUnique = jest.fn().mockResolvedValue(records[0]);
    const prisma = {
      isEnabled: true,
      position: { findMany, findUnique },
    } as unknown as PrismaService;
    const service = new PositionsService(prisma, new TradingMemoryStore());

    await expect(service.listForAccount(1)).resolves.toBe(records);
    await expect(service.find(1, 2)).resolves.toBe(records[0]);
    expect(findMany).toHaveBeenCalledWith({
      where: { paperAccountId: 1, quantity: { not: 0 } },
      orderBy: { id: 'asc' },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        paperAccountId_symbolId: { paperAccountId: 1, symbolId: 2 },
      },
    });
  });
});
