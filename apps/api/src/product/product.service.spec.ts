import { Prisma } from '@prisma/client';
import { ProductService, serializable } from './product.service';
import type { AutomationService } from '../automation/automation.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';
import type { MarketDataService } from '../market-data/market-data.service';
import type { PaperAccountsService } from '../trading/paper-accounts.service';
import { TradingMemoryStore } from '../trading/trading-memory.store';
import type { StrategiesService } from '../strategies/strategies.service';
import type { BacktestsRepository } from '../backtest/backtests.repository';
import type { JobsService } from '../jobs/jobs.service';
import type { AuditService } from '../observability/audit.service';
function fixture() {
  const user = { id: 'u1', email: 'u1@example.com' };
  const account = {
    id: 1,
    userId: 'u1',
    cashBalance: new Prisma.Decimal(123),
    startingBalance: new Prisma.Decimal(100000),
    updatedAt: new Date(),
  };
  const delegate = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue({}),
    upsert: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue(account),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    delete: jest.fn().mockResolvedValue({}),
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
  });
  const db = {
    paperAccount: delegate(),
    position: delegate(),
    order: delegate(),
    execution: delegate(),
    paperAccountArchive: delegate(),
    paperResetKey: delegate(),
    paperAutomation: delegate(),
    strategy: delegate(),
    strategyVersion: delegate(),
    backtestRun: delegate(),
    job: delegate(),
    auditEvent: delegate(),
    watchlistEntry: delegate(),
    aiUsage: delegate(),
    webAuthnCredential: delegate(),
    webAuthnChallenge: delegate(),
    oAuthState: delegate(),
    oAuthHandoff: delegate(),
    user: delegate(),
  };
  db.paperAccount.findUnique.mockResolvedValue(account);
  const prisma = {
    isEnabled: true,
    ...db,
    $transaction: jest.fn((fn: (tx: typeof db) => Promise<unknown>) => fn(db)),
  };
  const auth = {
    assertRecentSession: jest.fn().mockResolvedValue(undefined),
    requireUserBySessionToken: jest.fn(() => user),
    getProfileBySessionToken: jest.fn(() => user),
    listPasskeys: jest.fn(() => ({ passkeys: [] })),
    listSessions: jest.fn(() => ({ sessions: [] })),
    forgetUser: jest.fn(),
    beginAccountDeletion: jest.fn().mockResolvedValue(undefined),
    cancelAccountDeletion: jest.fn(),
  };
  const symbols = [
    { id: 1, symbol: 'AAPL', asset_type: 'EQUITY', is_active: true },
  ];
  const market = {
    lookupSymbol: jest.fn().mockResolvedValue(symbols[0]),
    getSymbolsByIds: jest.fn().mockResolvedValue(symbols),
  };
  const automation = {
    runUserWork: jest.fn((_id: string, fn: () => Promise<unknown>) => fn()),
    list: jest.fn().mockResolvedValue([]),
    stopMemoryForUser: jest.fn(),
    forgetUser: jest.fn(),
  };
  const stores = { forgetUser: jest.fn() };
  const audit = { ...stores, record: jest.fn().mockResolvedValue(undefined) };
  const service = new ProductService(
    automation as unknown as AutomationService,
    prisma as unknown as PrismaService,
    auth as unknown as AuthService,
    market as unknown as MarketDataService,
    {
      getForUser: jest.fn().mockResolvedValue(account),
    } as unknown as PaperAccountsService,
    new TradingMemoryStore(),
    stores as unknown as StrategiesService,
    stores as unknown as BacktestsRepository,
    stores as unknown as JobsService,
    audit as unknown as AuditService,
  );
  return {
    service,
    db,
    prisma,
    auth,
    market,
    automation,
    user,
    account,
    audit,
  };
}
describe('database account lifecycle', () => {
  it('archives an atomic ledger before resetting cash and retains retired order keys', async () => {
    const f = fixture();
    f.db.order.findMany.mockResolvedValue([
      { id: 'old-1', clientOrderId: 'key-1' },
      { id: 'old-2', clientOrderId: null },
    ]);
    await f.service.resetAccount('token');
    expect(f.db.paperAccountArchive.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          snapshotJson: expect.objectContaining({
            orders: expect.arrayContaining([
              expect.objectContaining({ id: 'old-1' }),
            ]),
          }),
        }),
      }),
    );
    expect(f.db.paperResetKey.createMany).toHaveBeenCalledWith({
      data: [{ paperAccountId: 1, clientOrderId: 'key-1' }],
      skipDuplicates: true,
    });
    expect(f.db.paperAccount.update).toHaveBeenLastCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ cashBalance: f.account.startingBalance }),
    });
    expect(
      f.db.paperAccountArchive.create.mock.invocationCallOrder[0],
    ).toBeLessThan(f.db.execution.deleteMany.mock.invocationCallOrder[0]);
    expect(f.db.paperAutomation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        data: expect.objectContaining({
          status: 'stopped',
          stateJson: expect.objectContaining({ quantity: '0' }),
        }),
      }),
    );
  });
  it('requires a recent session and rolls a reset back when its archive fails', async () => {
    const f = fixture();
    f.auth.assertRecentSession.mockRejectedValueOnce(new Error('expired'));
    await expect(f.service.resetAccount('token')).rejects.toThrow('expired');
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
    f.db.paperAccountArchive.create.mockRejectedValueOnce(
      new Error('archive failed'),
    );
    await expect(f.service.resetAccount('token')).rejects.toThrow(
      'archive failed',
    );
    expect(f.db.execution.deleteMany).not.toHaveBeenCalled();
    f.db.paperAccountArchive.create.mockResolvedValue({});
    await f.service.resetAccount('token');
    expect(f.db.paperResetKey.createMany).not.toHaveBeenCalled();
  });
  it('exports only owned rows in one repeatable-read transaction', async () => {
    const f = fixture();
    f.db.paperAccountArchive.findMany.mockResolvedValue([
      {
        id: 'a1',
        userId: 'u1',
        createdAt: new Date('2026-08-01'),
        snapshotJson: { ledger: true },
      },
    ]);
    expect(await f.service.accountArchives('u1')).toEqual({
      archives: [
        {
          id: 'a1',
          created_at: '2026-08-01T00:00:00.000Z',
          snapshot: { ledger: true },
        },
      ],
    });
    expect(await f.service.exportUser('token')).toMatchObject({
      profile: f.user,
      archives: expect.arrayContaining([expect.objectContaining({ id: 'a1' })]),
    });
    expect(f.db.strategy.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { versions: true },
    });
    expect(f.db.backtestRun.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      include: { result: true, trades: true, equityPoints: true },
    });
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
      timeout: 30000,
    });
  });
  it('deletes dependent owned records before removing the user and revokes cached state', async () => {
    const f = fixture();
    await f.service.deleteUser('token', 'u1@example.com');
    expect(f.db.execution.deleteMany).toHaveBeenCalledWith({
      where: { paperAccountId: 1 },
    });
    expect(f.db.strategyVersion.deleteMany).toHaveBeenCalledWith({
      where: { strategy: { userId: 'u1' } },
    });
    expect(f.db.oAuthHandoff.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
    expect(f.db.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(f.auth.forgetUser).toHaveBeenCalledWith('u1');
    expect(f.automation.forgetUser).toHaveBeenCalledWith('u1');
    expect(f.auth.cancelAccountDeletion).toHaveBeenCalledWith('u1');
  });
  it('blocks deletion during jobs and restores sign-in availability if deletion fails', async () => {
    const f = fixture();
    f.db.job.count.mockResolvedValue(1);
    await expect(
      f.service.deleteUser('token', 'u1@example.com'),
    ).rejects.toThrow();
    expect(f.db.user.delete).not.toHaveBeenCalled();
    expect(f.auth.forgetUser).not.toHaveBeenCalled();
    expect(f.auth.cancelAccountDeletion).toHaveBeenCalled();
    f.db.job.count.mockResolvedValue(0);
    f.db.paperAccount.findUnique.mockResolvedValue(null);
    await f.service.deleteUser('token', 'u1@example.com');
    expect(f.db.paperAccount.delete).not.toHaveBeenCalled();
  });
  it('persists owner watchlists, bounds additions, and permits an existing entry at capacity', async () => {
    const f = fixture();
    expect(f.service.dataMode).toBe('database');
    await f.service.saveWatchlistSymbol('u1', 'AAPL');
    expect(f.db.watchlistEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_symbolId: { userId: 'u1', symbolId: 1 } },
      }),
    );
    await f.service.removeWatchlistSymbol('u1', 'AAPL');
    expect(f.db.watchlistEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', symbolId: 1 },
    });
    f.market.getSymbolsByIds.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 2,
        symbol: `S${i}`,
        is_active: true,
      })),
    );
    await expect(f.service.saveWatchlistSymbol('u1', 'AAPL')).rejects.toThrow();
    f.market.getSymbolsByIds.mockResolvedValue(
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        symbol: `S${i}`,
        is_active: true,
      })),
    );
    await f.service.saveWatchlistSymbol('u1', 'AAPL');
    f.market.lookupSymbol.mockResolvedValue({ id: 1, is_active: false });
    await expect(f.service.saveWatchlistSymbol('u1', 'AAPL')).rejects.toThrow();
  });
  it('serializes decimal and bigint values without losing stored decimal strings', () => {
    expect(
      serializable({
        v: new Prisma.Decimal('123.45678901'),
        n: BigInt(123),
        date: new Date('2026-01-01'),
      }),
    ).toEqual({
      v: '123.45678901',
      n: '123',
      date: '2026-01-01T00:00:00.000Z',
    });
  });
});
