import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../prisma/prisma.service';
import { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import { cashNotional, roundMoney } from './trading-decimals';
import { TradingMemoryStore } from './trading-memory.store';
import type { TradingSide, TradingTransaction } from './trading.types';

export interface ApplyFillInput {
  accountId: number;
  symbolId: number;
  side: TradingSide;
  quantity: Prisma.Decimal.Value;
  price: Prisma.Decimal.Value;
}

@Injectable()
export class TradingLedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: PaperAccountsService,
    private readonly positions: PositionsService,
    private readonly memory: TradingMemoryStore,
  ) {}

  async applyFill(
    input: ApplyFillInput,
    tx?: TradingTransaction,
    memoryTransactionActive = false,
  ): Promise<{ cashBalance: Prisma.Decimal; cashNotional: Prisma.Decimal }> {
    if (this.prisma.isEnabled && !tx) {
      return this.prisma.$transaction((transaction) =>
        this.applyFill(input, transaction),
      );
    }
    if (!this.prisma.isEnabled && !memoryTransactionActive) {
      return this.memory.runAccountTransaction(input.accountId, () =>
        this.applyFill(input, undefined, true),
      );
    }

    const account = await this.accounts.getById(input.accountId, tx);
    if (!account || !account.isActive) {
      throw new DomainError(ErrorCode.TRADING_ACCOUNT_INACTIVE);
    }

    const notional = cashNotional(input.quantity, input.price);
    let cashBalance: Prisma.Decimal;
    if (input.side === 'BUY') {
      if (account.cashBalance.lt(notional)) {
        throw new DomainError(ErrorCode.TRADING_INSUFFICIENT_CASH);
      }
      await this.positions.applyBuy(
        input.accountId,
        input.symbolId,
        input.quantity,
        input.price,
        tx,
      );
      cashBalance = roundMoney(account.cashBalance.sub(notional));
    } else {
      await this.positions.applySell(
        input.accountId,
        input.symbolId,
        input.quantity,
        input.price,
        tx,
      );
      cashBalance = roundMoney(account.cashBalance.add(notional));
    }

    const updatedAt = new Date();
    if (this.prisma.isEnabled) {
      await (tx as TradingTransaction).paperAccount.update({
        where: { id: input.accountId },
        data: { cashBalance, updatedAt },
      });
    } else {
      const updated = { ...account, cashBalance, updatedAt };
      this.memory.paperAccountsById.set(input.accountId, updated);
      this.memory.paperAccountsByUserId.set(updated.userId, updated);
    }

    return { cashBalance, cashNotional: notional };
  }
}
