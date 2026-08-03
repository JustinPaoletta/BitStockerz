import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../prisma/prisma.service';
import { roundTrading } from './trading-decimals';
import { TradingMemoryStore } from './trading-memory.store';
import type { PositionRecord, TradingTransaction } from './trading.types';

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memory: TradingMemoryStore,
  ) {}

  async applyBuy(
    accountId: number,
    symbolId: number,
    quantity: Prisma.Decimal.Value,
    price: Prisma.Decimal.Value,
    tx?: TradingTransaction,
  ): Promise<PositionRecord> {
    if (this.prisma.isEnabled && !tx) {
      return this.prisma.$transaction((transaction) =>
        this.applyBuy(accountId, symbolId, quantity, price, transaction),
      );
    }

    const qty = roundTrading(quantity);
    const fillPrice = roundTrading(price);
    const existing = await this.find(accountId, symbolId, tx);
    const now = new Date();
    const nextQuantity = roundTrading(
      (existing?.quantity ?? new Prisma.Decimal(0)).add(qty),
    );
    const nextAverage = existing
      ? roundTrading(
          existing.quantity
            .mul(existing.avgCost)
            .add(qty.mul(fillPrice))
            .div(nextQuantity),
        )
      : fillPrice;

    if (this.prisma.isEnabled) {
      return (tx as TradingTransaction).position.upsert({
        where: {
          paperAccountId_symbolId: { paperAccountId: accountId, symbolId },
        },
        update: {
          quantity: nextQuantity,
          avgCost: nextAverage,
          updatedAt: now,
        },
        create: {
          paperAccountId: accountId,
          symbolId,
          quantity: nextQuantity,
          avgCost: nextAverage,
          updatedAt: now,
        },
      });
    }

    const record: PositionRecord = existing
      ? {
          ...existing,
          quantity: nextQuantity,
          avgCost: nextAverage,
          updatedAt: now,
        }
      : {
          id: this.memory.allocatePositionId(),
          paperAccountId: accountId,
          symbolId,
          quantity: nextQuantity,
          avgCost: nextAverage,
          updatedAt: now,
        };
    this.memory.positionsByKey.set(
      this.memory.positionKey(accountId, symbolId),
      record,
    );
    return record;
  }

  async applySell(
    accountId: number,
    symbolId: number,
    quantity: Prisma.Decimal.Value,
    _price: Prisma.Decimal.Value,
    tx?: TradingTransaction,
  ): Promise<PositionRecord | null> {
    if (this.prisma.isEnabled && !tx) {
      return this.prisma.$transaction((transaction) =>
        this.applySell(accountId, symbolId, quantity, _price, transaction),
      );
    }

    const qty = roundTrading(quantity);
    const existing = await this.find(accountId, symbolId, tx);
    if (!existing || existing.quantity.lt(qty)) {
      throw new DomainError(ErrorCode.TRADING_INSUFFICIENT_POSITION);
    }

    const nextQuantity = roundTrading(existing.quantity.sub(qty));
    if (nextQuantity.isZero()) {
      if (this.prisma.isEnabled) {
        await (tx as TradingTransaction).position.delete({
          where: { id: existing.id },
        });
      } else {
        this.memory.positionsByKey.delete(
          this.memory.positionKey(accountId, symbolId),
        );
      }
      return null;
    }

    const now = new Date();
    if (this.prisma.isEnabled) {
      return (tx as TradingTransaction).position.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity, updatedAt: now },
      });
    }

    const updated = { ...existing, quantity: nextQuantity, updatedAt: now };
    this.memory.positionsByKey.set(
      this.memory.positionKey(accountId, symbolId),
      updated,
    );
    return updated;
  }

  async listForAccount(
    accountId: number,
    tx?: TradingTransaction,
  ): Promise<PositionRecord[]> {
    if (this.prisma.isEnabled) {
      return (tx ?? this.prisma).position.findMany({
        where: { paperAccountId: accountId, quantity: { not: 0 } },
        orderBy: { id: 'asc' },
      });
    }
    return this.memory
      .getPositionsForAccount(accountId)
      .filter((position) => !position.quantity.isZero())
      .sort((left, right) => left.id - right.id);
  }

  async find(
    accountId: number,
    symbolId: number,
    tx?: TradingTransaction,
  ): Promise<PositionRecord | null> {
    if (this.prisma.isEnabled) {
      return (tx ?? this.prisma).position.findUnique({
        where: {
          paperAccountId_symbolId: { paperAccountId: accountId, symbolId },
        },
      });
    }
    return (
      this.memory.positionsByKey.get(
        this.memory.positionKey(accountId, symbolId),
      ) ?? null
    );
  }
}
