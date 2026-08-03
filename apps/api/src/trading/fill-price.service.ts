import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  MarketDataService,
  type LatestClose,
} from '../market-data/market-data.service';

@Injectable()
export class FillPriceService {
  constructor(private readonly marketData: MarketDataService) {}

  async getLatestClose(symbol: string): Promise<{
    symbolId: number;
    symbol: string;
    price: Prisma.Decimal;
    asOf: Date;
    interval: '1d' | '1h';
  }> {
    return toFillPrice(await this.marketData.getLatestClose(symbol));
  }

  async getLatestClosesByIds(
    symbolIds: number[],
  ): Promise<Map<number, Prisma.Decimal>> {
    let records: Awaited<ReturnType<MarketDataService['getLatestClosesByIds']>>;
    try {
      records = await this.marketData.getLatestClosesByIds(symbolIds);
    } catch (error) {
      if (error instanceof DomainError && error.code === ErrorCode.NOT_FOUND) {
        throw new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE);
      }
      throw error;
    }
    return new Map(
      [...records].map(([symbolId, close]) => [
        symbolId,
        new Prisma.Decimal(close.price),
      ]),
    );
  }
}

function toFillPrice(close: LatestClose) {
  return {
    symbolId: close.symbol_id,
    symbol: close.symbol,
    price: new Prisma.Decimal(close.price),
    asOf: new Date(close.as_of),
    interval: close.interval,
  };
}
