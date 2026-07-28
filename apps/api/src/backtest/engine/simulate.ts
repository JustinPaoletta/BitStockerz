import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import { checkBudget, type ExecutionBudget } from './budget';
import type {
  EngineBar,
  EngineEquityPoint,
  EngineTrade,
} from './backtest-engine.types';
import type { IndicatorSeries } from './indicators';
import { evaluateRiskExit, type RuntimeRiskRules } from './risk-exits';
import { evaluateRules } from './rules';

interface OpenPosition {
  entryIndex: number;
  entryTime: Date;
  entryPrice: number;
  quantity: number;
}

export interface SimulationOutput {
  trades: EngineTrade[];
  equityCurve: EngineEquityPoint[];
  signalsFired: number;
}

export function simulateStrategy(
  definition: StrategyDefinition,
  bars: readonly EngineBar[],
  indicators: IndicatorSeries,
  initialEquity: number,
  symbolId: number | undefined,
  budget?: ExecutionBudget,
): SimulationOutput {
  const trades: EngineTrade[] = [];
  const equityCurve: EngineEquityPoint[] = [];
  const runtimeRisk = (
    definition as StrategyDefinition & { risk?: RuntimeRiskRules }
  ).risk;
  let cash = initialEquity;
  let position: OpenPosition | null = null;
  let signalsFired = 0;

  bars.forEach((bar, index) => {
    checkBudget(budget, index);
    let exitedThisBar = false;

    if (position && index > position.entryIndex) {
      const riskExit = evaluateRiskExit(position.entryPrice, bar, runtimeRisk);
      if (riskExit) {
        const closed = closePosition(
          position,
          bar.ts,
          riskExit.price,
          symbolId,
        );
        trades.push(closed);
        cash = finiteArithmetic(position.quantity * riskExit.price);
        position = null;
        exitedThisBar = true;
      }
    }

    if (
      position &&
      evaluateRules(definition.exit, { bars, indicators, index })
    ) {
      signalsFired += 1;
      const closed = closePosition(position, bar.ts, bar.close, symbolId);
      trades.push(closed);
      cash = finiteArithmetic(position.quantity * bar.close);
      position = null;
      exitedThisBar = true;
    }

    if (
      !position &&
      !exitedThisBar &&
      evaluateRules(definition.entry, { bars, indicators, index })
    ) {
      signalsFired += 1;
      const quantity = finiteArithmetic(cash / bar.close);
      position = {
        entryIndex: index,
        entryTime: cloneDate(bar.ts),
        entryPrice: bar.close,
        quantity,
      };
      cash = 0;
    }

    const equity = position
      ? finiteArithmetic(position.quantity * bar.close)
      : cash;
    equityCurve.push({ ts: cloneDate(bar.ts), equity });
  });

  const remainingPosition = position as OpenPosition | null;
  if (remainingPosition) {
    const lastBar = bars.at(-1);
    if (!lastBar) {
      throw new DomainError(
        ErrorCode.BACKTEST_INSUFFICIENT_BARS,
        'At least one bar is required.',
      );
    }
    const closed = closePosition(
      remainingPosition,
      lastBar.ts,
      lastBar.close,
      symbolId,
    );
    trades.push(closed);
    cash = finiteArithmetic(remainingPosition.quantity * lastBar.close);
    position = null;
    equityCurve[equityCurve.length - 1].equity = cash;
  }

  checkBudget(budget, bars.length, true);
  return { trades, equityCurve, signalsFired };
}

function closePosition(
  position: OpenPosition,
  exitTime: Date,
  exitPrice: number,
  symbolId: number | undefined,
): EngineTrade {
  const pnlAbs = finiteArithmetic(
    position.quantity * (exitPrice - position.entryPrice),
  );
  const pnlPct = finiteArithmetic(
    ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
  );
  return {
    entryTime: cloneDate(position.entryTime),
    exitTime: cloneDate(exitTime),
    side: 'long',
    entryPrice: position.entryPrice,
    exitPrice,
    quantity: position.quantity,
    pnlAbs,
    pnlPct,
    ...(symbolId === undefined ? {} : { symbolId }),
  };
}

function finiteArithmetic(value: number): number {
  if (!Number.isFinite(value)) {
    throw new DomainError(
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
      'Backtest arithmetic exceeded the numeric range.',
    );
  }
  return value;
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}
