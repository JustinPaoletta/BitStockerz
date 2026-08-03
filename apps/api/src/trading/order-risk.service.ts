import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { cashNotional, decimal } from './trading-decimals';
import type { OrderRejectReason, TradingSide } from './trading.types';

export interface RiskEvaluationInput {
  side: TradingSide;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  cashBalance: Prisma.Decimal;
  currentPositionQuantity: Prisma.Decimal;
  preTradeEquity: Prisma.Decimal;
}

@Injectable()
export class OrderRiskService {
  constructor(private readonly config: AppConfigService) {}

  evaluate(input: RiskEvaluationInput): OrderRejectReason | null {
    const limits = this.config.trading;
    const unroundedNotional = input.quantity.mul(input.price);
    const roundedNotional = cashNotional(input.quantity, input.price);

    if (unroundedNotional.gt(decimal(limits.maxOrderNotional))) {
      return 'MAX_ORDER_NOTIONAL';
    }

    if (input.side === 'SELL') {
      return input.currentPositionQuantity.lt(input.quantity)
        ? 'INSUFFICIENT_POSITION'
        : null;
    }

    const remainingCash = input.cashBalance.sub(roundedNotional);
    if (remainingCash.isNegative()) return 'INSUFFICIENT_CASH';
    if (remainingCash.lt(decimal(limits.minCashRemaining))) {
      return 'MIN_CASH_REMAINING';
    }

    if (input.preTradeEquity.lte(0)) return 'MAX_POSITION_PCT';
    const resultingPositionValue = input.currentPositionQuantity
      .add(input.quantity)
      .mul(input.price);
    const positionPct = resultingPositionValue
      .div(input.preTradeEquity)
      .mul(100);
    if (positionPct.gt(decimal(limits.maxPositionPct))) {
      return 'MAX_POSITION_PCT';
    }

    return null;
  }
}
