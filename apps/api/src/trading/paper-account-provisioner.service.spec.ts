import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import { PaperAccountProvisioner } from './paper-account-provisioner.service';
import { TradingMemoryStore } from './trading-memory.store';

const config = {
  trading: {
    paperStartingBalance: '100000.00',
    maxOrderNotional: '25000',
    maxPositionPct: '25',
    minCashRemaining: '0',
  },
} as AppConfigService;

describe('PaperAccountProvisioner', () => {
  it('creates one default seed account per user', async () => {
    const memory = new TradingMemoryStore();
    const service = new PaperAccountProvisioner(
      { isEnabled: false } as PrismaService,
      config,
      memory,
    );

    const first = await service.ensureForUser('user-1');
    const replay = await service.ensureForUser('user-1');
    expect(replay).toBe(first);
    expect(first).toMatchObject({
      id: 1,
      name: 'Paper Account',
      baseCurrency: 'USD',
      isActive: true,
    });
    expect(first.startingBalance.toFixed(2)).toBe('100000.00');
    expect(first.cashBalance.toFixed(2)).toBe('100000.00');
  });

  it('uses an idempotent Prisma upsert with decimal defaults', async () => {
    const createdAt = new Date();
    const upsert = jest.fn().mockResolvedValue({
      id: 7,
      userId: 'user-1',
      name: 'Paper Account',
      baseCurrency: 'USD',
      startingBalance: { toString: () => '100000' },
      cashBalance: { toString: () => '100000' },
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
    const service = new PaperAccountProvisioner(
      { isEnabled: true, paperAccount: { upsert } } as unknown as PrismaService,
      config,
      new TradingMemoryStore(),
    );

    await service.ensureForUser('user-1');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: {},
        create: expect.objectContaining({
          name: 'Paper Account',
          baseCurrency: 'USD',
          isActive: true,
        }),
      }),
    );
  });
});
