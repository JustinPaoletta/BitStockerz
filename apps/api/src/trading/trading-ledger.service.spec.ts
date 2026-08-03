import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import { TradingLedgerService } from './trading-ledger.service';
import { TradingMemoryStore } from './trading-memory.store';
import type { PaperAccountRecord } from './trading.types';

describe('TradingLedgerService seed mode', () => {
  let memory: TradingMemoryStore;
  let positions: PositionsService;
  let ledger: TradingLedgerService;
  let account: PaperAccountRecord;

  beforeEach(() => {
    memory = new TradingMemoryStore();
    account = {
      id: 1,
      userId: 'user-1',
      name: 'Paper Account',
      baseCurrency: 'USD',
      startingBalance: new Prisma.Decimal('100'),
      cashBalance: new Prisma.Decimal('100'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memory.paperAccountsById.set(1, account);
    memory.paperAccountsByUserId.set(account.userId, account);
    const prisma = { isEnabled: false } as PrismaService;
    positions = new PositionsService(prisma, memory);
    const accounts = {
      getById: jest.fn(async () => memory.paperAccountsById.get(1) ?? null),
    } as unknown as PaperAccountsService;
    ledger = new TradingLedgerService(prisma, accounts, positions, memory);
  });

  it('debits at the exact cash boundary and never goes negative', async () => {
    const result = await ledger.applyFill({
      accountId: 1,
      symbolId: 1,
      side: 'BUY',
      quantity: '3',
      price: '33.333',
    });
    expect(result.cashNotional.toFixed(2)).toBe('100.00');
    expect(result.cashBalance.toFixed(2)).toBe('0.00');
  });

  it('rejects overspending without opening a position', async () => {
    await expect(
      ledger.applyFill({
        accountId: 1,
        symbolId: 1,
        side: 'BUY',
        quantity: '1',
        price: '100.01',
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCode.TRADING_INSUFFICIENT_CASH,
    });
    await expect(positions.find(1, 1)).resolves.toBeNull();
  });

  it('credits cash after a sell and reduces the position', async () => {
    await ledger.applyFill({
      accountId: 1,
      symbolId: 1,
      side: 'BUY',
      quantity: '2',
      price: '10',
    });
    const result = await ledger.applyFill({
      accountId: 1,
      symbolId: 1,
      side: 'SELL',
      quantity: '0.5',
      price: '12.345',
    });
    expect(result.cashBalance.toFixed(2)).toBe('86.17');
    expect((await positions.find(1, 1))?.quantity.toFixed(8)).toBe(
      '1.50000000',
    );
  });

  it('rejects inactive accounts before mutation', async () => {
    memory.paperAccountsById.set(1, { ...account, isActive: false });
    await expect(
      ledger.applyFill({
        accountId: 1,
        symbolId: 1,
        side: 'BUY',
        quantity: '1',
        price: '1',
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCode.TRADING_ACCOUNT_INACTIVE,
    });

    memory.paperAccountsById.delete(1);
    await expect(
      ledger.applyFill({
        accountId: 1,
        symbolId: 1,
        side: 'BUY',
        quantity: '1',
        price: '1',
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({
      code: ErrorCode.TRADING_ACCOUNT_INACTIVE,
    });
  });
});

describe('TradingLedgerService database mode', () => {
  it('runs a standalone fill transaction and persists its cash result', async () => {
    const account = {
      id: 7,
      userId: 'user-1',
      name: 'Paper Account',
      baseCurrency: 'USD',
      startingBalance: new Prisma.Decimal('1000'),
      cashBalance: new Prisma.Decimal('1000'),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const update = jest.fn().mockResolvedValue({});
    const tx = { paperAccount: { update } };
    const prisma = {
      isEnabled: true,
      $transaction: jest.fn(
        async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
      ),
    } as unknown as PrismaService;
    const accounts = {
      getById: jest.fn().mockResolvedValue(account),
    } as unknown as PaperAccountsService;
    const positions = {
      applyBuy: jest.fn().mockResolvedValue({}),
      applySell: jest.fn().mockResolvedValue({}),
    } as unknown as PositionsService;
    const ledger = new TradingLedgerService(
      prisma,
      accounts,
      positions,
      new TradingMemoryStore(),
    );

    const result = await ledger.applyFill({
      accountId: 7,
      symbolId: 1,
      side: 'BUY',
      quantity: '2',
      price: '25',
    });

    expect(result.cashBalance.toFixed(2)).toBe('950.00');
    expect(positions.applyBuy).toHaveBeenCalledWith(7, 1, '2', '25', tx);
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        cashBalance: expect.any(Prisma.Decimal),
        updatedAt: expect.any(Date),
      }),
    });
  });
});
