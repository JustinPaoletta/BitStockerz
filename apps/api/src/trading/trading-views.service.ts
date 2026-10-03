import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { MarketDataService } from '../market-data/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { FillPriceService } from './fill-price.service';
import { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import { formatMoney, formatTrading } from './trading-decimals';
import { TradingMemoryStore } from './trading-memory.store';
import type { TradingTransaction } from './trading.types';

@Injectable()
export class TradingViewsService {
  constructor(
    private readonly accounts: PaperAccountsService,
    private readonly positions: PositionsService,
    private readonly prices: FillPriceService,
    private readonly marketData: MarketDataService,
    private readonly prisma: PrismaService,
    private readonly memory: TradingMemoryStore,
  ) {}

  async listPositions(userId: string) {
    const account = await this.accounts.getForUser(userId);
    const positions = await this.positions.listForAccount(account.id);
    const symbols = new Map(
      (
        await this.marketData.getSymbolsByIds(
          positions.map((item) => item.symbolId),
        )
      ).map((item) => [item.id, item.symbol]),
    );
    return {
      positions: positions
        .map((position) => ({
          id: position.id,
          symbol: symbols.get(position.symbolId) ?? 'UNKNOWN',
          quantity: formatTrading(position.quantity),
          avg_cost: formatTrading(position.avgCost),
        }))
        .sort(
          (left, right) =>
            left.symbol.localeCompare(right.symbol) || left.id - right.id,
        )
        .map((position) => ({
          symbol: position.symbol,
          quantity: position.quantity,
          avg_cost: position.avg_cost,
        })),
    };
  }

  async getPortfolioSummary(userId: string) {
    const provisioned = await this.accounts.getForUser(userId);
    const readSnapshot = async (tx?: TradingTransaction) => {
      const account = await this.accounts.getById(provisioned.id, tx);
      if (!account) throw new DomainError(ErrorCode.NOT_FOUND);
      const positions = await this.positions.listForAccount(account.id, tx);
      return { account, positions };
    };
    // Read both sides of the ledger consistently while fills update them atomically.
    const { account, positions } = this.prisma.isEnabled
      ? await this.prisma.$transaction(readSnapshot, {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        })
      : await this.memory.runAccountTransaction(provisioned.id, readSnapshot);
    let totalPositionValue = new Prisma.Decimal(0);
    const openCostBasis = positions.reduce(
      (cost, position) => cost.add(position.quantity.mul(position.avgCost)),
      new Prisma.Decimal(0),
    );

    if (positions.length > 0) {
      let closes: Map<number, Prisma.Decimal>;
      try {
        closes = await this.prices.getLatestClosesByIds(
          positions.map((position) => position.symbolId),
        );
      } catch (error) {
        if (
          error instanceof DomainError &&
          [ErrorCode.NOT_FOUND, ErrorCode.TRADING_NO_MARKET_PRICE].includes(
            error.code,
          )
        ) {
          throw new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE);
        }
        throw error;
      }
      for (const position of positions) {
        const close = closes.get(position.symbolId);
        if (!close) {
          throw new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE);
        }
        totalPositionValue = totalPositionValue.add(
          position.quantity.mul(close),
        );
      }
    }

    const totalEquity = account.cashBalance.add(totalPositionValue);
    const totalPnl = formatMoney(totalEquity.sub(account.startingBalance));
    // Only fills change cash in the MVP. Equity minus initial funding decomposes
    // into open-position P&L and realized P&L, including cash-rounding residuals.
    // Realized P&L depends only on the ledger, never on current market prices.
    const realizedTotal = formatMoney(
      account.cashBalance.add(openCostBasis).sub(account.startingBalance),
    );
    const unrealizedTotal = formatMoney(
      new Prisma.Decimal(totalPnl).sub(realizedTotal),
    );
    return {
      cash_balance: formatMoney(account.cashBalance),
      total_position_value: formatMoney(totalPositionValue),
      total_equity: formatMoney(totalEquity),
      unrealized_pnl_total: unrealizedTotal,
      realized_pnl_total: realizedTotal,
      total_pnl: totalPnl,
    };
  }
}
