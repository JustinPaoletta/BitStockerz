import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { MarketDataService } from '../market-data/market-data.service';
import { FillPriceService } from './fill-price.service';
import { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import { formatMoney, formatTrading } from './trading-decimals';

@Injectable()
export class TradingViewsService {
  constructor(
    private readonly accounts: PaperAccountsService,
    private readonly positions: PositionsService,
    private readonly prices: FillPriceService,
    private readonly marketData: MarketDataService,
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
    const account = await this.accounts.getForUser(userId);
    const positions = await this.positions.listForAccount(account.id);
    let totalPositionValue = new Prisma.Decimal(0);
    let unrealizedPnl = new Prisma.Decimal(0);

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
        unrealizedPnl = unrealizedPnl.add(
          close.sub(position.avgCost).mul(position.quantity),
        );
      }
    }

    return {
      cash_balance: formatMoney(account.cashBalance),
      total_position_value: formatMoney(totalPositionValue),
      total_equity: formatMoney(account.cashBalance.add(totalPositionValue)),
      unrealized_pnl_total: formatMoney(unrealizedPnl),
    };
  }
}
