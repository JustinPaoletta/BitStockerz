import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import { checkBudget, type ExecutionBudget } from './budget';
import type {
  EngineBar,
  EngineEquityPoint,
  EngineTrade,
  SimulationSettings,
} from './backtest-engine.types';
import type { IndicatorSeries } from './indicators';
import { evaluateRiskExit, type RuntimeRiskRules } from './risk-exits';
import { evaluateRules } from './rules';
import { DEFAULT_SIMULATION } from './simulation-settings';

interface OpenPosition {
  entryIndex: number;
  entryTime: Date;
  entryPrice: number;
  quantity: number;
  entryFee: number;
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
  settings: SimulationSettings = DEFAULT_SIMULATION,
): SimulationOutput {
  const trades: EngineTrade[] = [];
  const equityCurve: EngineEquityPoint[] = [];
  const runtimeRisk = (
    definition as StrategyDefinition & { risk?: RuntimeRiskRules }
  ).risk;
  const commission = settings.commission_bps / 10000;
  const slippage = settings.slippage_bps / 10000;
  let cash = initialEquity;
  let position: OpenPosition | null = null;
  let pending: 'buy' | 'sell' | null = null;
  let signalsFired = 0;

  const buy = (bar: EngineBar, index: number, quote: number) => {
    const entryPrice = finiteArithmetic(quote * (1 + slippage));
    const budgeted = (cash * settings.allocation_pct) / 100;
    const quantity = finiteArithmetic(
      budgeted / (entryPrice * (1 + commission)),
    );
    const entryFee = quantity * entryPrice * commission;
    cash = finiteArithmetic(
      Math.max(0, cash - quantity * entryPrice - entryFee),
    );
    position = {
      entryIndex: index,
      entryTime: cloneDate(bar.ts),
      entryPrice,
      quantity,
      entryFee,
    };
  };
  const sell = (bar: EngineBar, quote: number) => {
    if (!position) return;
    const exitPrice = finiteArithmetic(quote * (1 - slippage));
    const exitFee = position.quantity * exitPrice * commission;
    const feesAbs = position.entryFee + exitFee;
    const pnlAbs = finiteArithmetic(
      position.quantity * (exitPrice - position.entryPrice) - feesAbs,
    );
    const pnlPct = finiteArithmetic(
      feesAbs
        ? (pnlAbs /
            (position.quantity * position.entryPrice + position.entryFee)) *
            100
        : ((exitPrice - position.entryPrice) / position.entryPrice) * 100,
    );
    trades.push({
      entryTime: cloneDate(position.entryTime),
      exitTime: cloneDate(bar.ts),
      side: 'long',
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      pnlAbs,
      pnlPct,
      ...(feesAbs ? { feesAbs } : {}),
      ...(symbolId === undefined ? {} : { symbolId }),
    });
    cash = finiteArithmetic(cash + position.quantity * exitPrice - exitFee);
    position = null;
  };

  bars.forEach((bar, index) => {
    checkBudget(budget, index);
    let exitedThisBar = false;
    let enteredAtOpen = false;
    if (pending === 'sell' && position) {
      sell(bar, bar.open);
      exitedThisBar = true;
    } else if (pending === 'buy' && !position) {
      buy(bar, index, bar.open);
      enteredAtOpen = true;
    }
    pending = null;
    // Next-open entries are exposed to that bar's range; close entries are not.
    if (position && (index > position.entryIndex || enteredAtOpen)) {
      const riskExit = evaluateRiskExit(position.entryPrice, bar, runtimeRisk);
      if (riskExit) {
        sell(bar, riskExit.price);
        exitedThisBar = true;
      }
    }
    if (
      position &&
      evaluateRules(definition.exit, { bars, indicators, index })
    ) {
      signalsFired++;
      if (settings.execution_timing === 'next_open') pending = 'sell';
      else {
        sell(bar, bar.close);
        exitedThisBar = true;
      }
    }
    if (
      !position &&
      !exitedThisBar &&
      evaluateRules(definition.entry, { bars, indicators, index })
    ) {
      signalsFired++;
      if (settings.execution_timing === 'next_open') pending = 'buy';
      else buy(bar, index, bar.close);
    }
    const current = position;
    equityCurve.push({
      ts: cloneDate(bar.ts),
      equity: finiteArithmetic(
        cash + (current ? current.quantity * bar.close : 0),
      ),
    });
  });
  // An unfilled final-bar entry signal expires; an existing position is liquidated.
  const lastBar = bars.at(-1);
  if (position && lastBar) {
    sell(lastBar, lastBar.close);
    equityCurve[equityCurve.length - 1].equity = cash;
  }
  checkBudget(budget, bars.length, true);
  return { trades, equityCurve, signalsFired };
}
function finiteArithmetic(value: number): number {
  if (!Number.isFinite(value))
    throw new DomainError(
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
      'Backtest arithmetic exceeded the numeric range.',
    );
  return value;
}
function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}
