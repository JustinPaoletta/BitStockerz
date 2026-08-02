import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaperAccountProvisioner } from './paper-account-provisioner.service';
import { formatMoney } from './trading-decimals';
import { TradingMemoryStore } from './trading-memory.store';
import type {
  PaperAccountRecord,
  PaperAccountResponse,
  TradingTransaction,
} from './trading.types';

@Injectable()
export class PaperAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly provisioner: PaperAccountProvisioner,
    private readonly memory: TradingMemoryStore,
  ) {}

  async getForUser(userId: string): Promise<PaperAccountRecord> {
    await this.auth.ensureUserPersisted(userId);
    return this.provisioner.ensureForUser(userId);
  }

  async getById(
    accountId: number,
    tx?: TradingTransaction,
  ): Promise<PaperAccountRecord | null> {
    if (this.prisma.isEnabled) {
      return (tx ?? this.prisma).paperAccount.findUnique({
        where: { id: accountId },
      });
    }
    return this.memory.paperAccountsById.get(accountId) ?? null;
  }

  toResponse(account: PaperAccountRecord): PaperAccountResponse {
    return {
      id: account.id,
      base_currency: account.baseCurrency,
      starting_balance: formatMoney(account.startingBalance),
      cash_balance: formatMoney(account.cashBalance),
      created_at: account.createdAt.toISOString(),
    };
  }
}
