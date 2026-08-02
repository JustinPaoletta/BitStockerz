import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { TradingMemoryStore } from './trading-memory.store';
import type { PaperAccountRecord } from './trading.types';

const DEFAULT_ACCOUNT_NAME = 'Paper Account';
const DEFAULT_BASE_CURRENCY = 'USD';

@Injectable()
export class PaperAccountProvisioner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly memory: TradingMemoryStore,
  ) {}

  async ensureForUser(userId: string): Promise<PaperAccountRecord> {
    if (this.prisma.isEnabled) {
      const now = new Date();
      const balance = new Prisma.Decimal(
        this.config.trading.paperStartingBalance,
      );
      const record = await this.prisma.paperAccount.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          name: DEFAULT_ACCOUNT_NAME,
          baseCurrency: DEFAULT_BASE_CURRENCY,
          startingBalance: balance,
          cashBalance: balance,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      return record;
    }

    const existing = this.memory.paperAccountsByUserId.get(userId);
    if (existing) return existing;

    const now = new Date();
    const balance = new Prisma.Decimal(
      this.config.trading.paperStartingBalance,
    );
    const created: PaperAccountRecord = {
      id: this.memory.allocatePaperAccountId(),
      userId,
      name: DEFAULT_ACCOUNT_NAME,
      baseCurrency: DEFAULT_BASE_CURRENCY,
      startingBalance: balance,
      cashBalance: balance,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.memory.paperAccountsByUserId.set(userId, created);
    this.memory.paperAccountsById.set(created.id, created);
    return created;
  }
}
