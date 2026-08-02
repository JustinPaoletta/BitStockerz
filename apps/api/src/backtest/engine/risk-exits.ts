import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { PercentRiskRule } from '../../strategies/definition/strategy-definition.types';
import type { EngineBar } from './backtest-engine.types';

export type RiskExitReason = 'stop_loss' | 'take_profit';

export interface RiskExit {
  price: number;
  reason: RiskExitReason;
}

export interface RuntimeRiskRules {
  stop_loss?: PercentRiskRule;
  take_profit?: PercentRiskRule;
}

export function evaluateRiskExit(
  entryPrice: number,
  bar: EngineBar,
  risk: RuntimeRiskRules | undefined,
): RiskExit | null {
  const stopLoss = risk?.stop_loss;
  if (stopLoss) {
    assertRiskRule(stopLoss);
    const stopPrice = finiteThreshold(entryPrice * (1 - stopLoss.value / 100));
    if (bar.low <= stopPrice) {
      return { price: stopPrice, reason: 'stop_loss' };
    }
  }

  const takeProfit = risk?.take_profit;
  if (takeProfit) {
    assertRiskRule(takeProfit);
    const takePrice = finiteThreshold(
      entryPrice * (1 + takeProfit.value / 100),
    );
    if (bar.high >= takePrice) {
      return { price: takePrice, reason: 'take_profit' };
    }
  }

  return null;
}

function assertRiskRule(rule: PercentRiskRule): void {
  if (
    rule.type !== 'percent' ||
    typeof rule.value !== 'number' ||
    !Number.isFinite(rule.value) ||
    rule.value <= 0
  ) {
    throw new DomainError(
      ErrorCode.BACKTEST_INVALID_DEFINITION,
      'Risk exits must use a positive finite percentage.',
    );
  }
}

function finiteThreshold(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError(
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
      'Backtest arithmetic exceeded the numeric range.',
    );
  }
  return value;
}
