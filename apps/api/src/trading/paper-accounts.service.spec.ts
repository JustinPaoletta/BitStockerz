import { Prisma } from '@prisma/client';
import type { AuthService } from '../auth/auth.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PaperAccountProvisioner } from './paper-account-provisioner.service';
import { PaperAccountsService } from './paper-accounts.service';
import { TradingMemoryStore } from './trading-memory.store';

const account = {
  id: 7,
  userId: 'user-1',
  name: 'Paper Account',
  baseCurrency: 'USD',
  startingBalance: new Prisma.Decimal('100000'),
  cashBalance: new Prisma.Decimal('98765.4321'),
  isActive: true,
  createdAt: new Date('2026-08-02T12:00:00.000Z'),
  updatedAt: new Date('2026-08-02T12:00:00.000Z'),
};

describe('PaperAccountsService', () => {
  it('persists the owner before provisioning and formats the response', async () => {
    const auth = {
      ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const provisioner = {
      ensureForUser: jest.fn().mockResolvedValue(account),
    } as unknown as PaperAccountProvisioner;
    const service = new PaperAccountsService(
      { isEnabled: false } as PrismaService,
      auth,
      provisioner,
      new TradingMemoryStore(),
    );

    await expect(service.getForUser('user-1')).resolves.toBe(account);
    expect(auth.ensureUserPersisted).toHaveBeenCalledWith('user-1');
    expect(provisioner.ensureForUser).toHaveBeenCalledWith('user-1');
    expect(service.toResponse(account)).toEqual({
      id: 7,
      base_currency: 'USD',
      starting_balance: '100000.00',
      cash_balance: '98765.43',
      created_at: '2026-08-02T12:00:00.000Z',
    });
  });

  it('reads or misses seed accounts by id', async () => {
    const memory = new TradingMemoryStore();
    memory.paperAccountsById.set(account.id, account);
    const service = new PaperAccountsService(
      { isEnabled: false } as PrismaService,
      {} as AuthService,
      {} as PaperAccountProvisioner,
      memory,
    );

    await expect(service.getById(7)).resolves.toBe(account);
    await expect(service.getById(8)).resolves.toBeNull();
  });

  it('uses either the Prisma service or caller transaction for reads', async () => {
    const directFind = jest.fn().mockResolvedValue(account);
    const txFind = jest.fn().mockResolvedValue(null);
    const prisma = {
      isEnabled: true,
      paperAccount: { findUnique: directFind },
    } as unknown as PrismaService;
    const service = new PaperAccountsService(
      prisma,
      {} as AuthService,
      {} as PaperAccountProvisioner,
      new TradingMemoryStore(),
    );

    await expect(service.getById(7)).resolves.toBe(account);
    await expect(
      service.getById(8, { paperAccount: { findUnique: txFind } } as never),
    ).resolves.toBeNull();
    expect(directFind).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(txFind).toHaveBeenCalledWith({ where: { id: 8 } });
  });
});
