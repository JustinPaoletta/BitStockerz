import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { checkBudget, type ExecutionBudget } from './budget';
import type {
  EngineEquityPoint,
  EngineMetrics,
  EngineTrade,
} from './backtest-engine.types';

export function calculateMetrics(
  initialEquity: number,
  trades: readonly EngineTrade[],
  equityCurve: readonly EngineEquityPoint[],
  budget?: ExecutionBudget,
): EngineMetrics {
  const finalEquity = equityCurve.at(-1)?.equity ?? initialEquity;
  const totalReturnPct = ((finalEquity - initialEquity) / initialEquity) * 100;

  let peak = initialEquity;
  let maxDrawdownPct = 0;
  equityCurve.forEach((point, index) => {
    checkBudget(budget, index);
    assertFinite(point.equity);
    peak = Math.max(peak, point.equity);
    const drawdown = peak === 0 ? 0 : ((peak - point.equity) / peak) * 100;
    maxDrawdownPct = Math.max(maxDrawdownPct, drawdown);
  });

  let winCount = 0;
  let winSumPct = 0;
  let lossCount = 0;
  let lossSumPct = 0;
  trades.forEach((trade, index) => {
    checkBudget(budget, index);
    assertFinite(trade.pnlPct);
    if (trade.pnlAbs > 0) {
      winCount += 1;
      winSumPct += trade.pnlPct;
    } else if (trade.pnlAbs < 0) {
      lossCount += 1;
      lossSumPct += trade.pnlPct;
    }
  });

  const winRatePct = trades.length === 0 ? 0 : (winCount / trades.length) * 100;
  const avgWinPct = winCount === 0 ? 0 : winSumPct / winCount;
  const avgLossPct = lossCount === 0 ? 0 : lossSumPct / lossCount;
  const sharpeRatio = calculateSharpe(equityCurve, budget);

  for (const value of [
    finalEquity,
    totalReturnPct,
    maxDrawdownPct,
    winRatePct,
    avgWinPct,
    avgLossPct,
  ]) {
    assertFinite(value);
  }

  return {
    finalEquity,
    totalReturnPct,
    maxDrawdownPct,
    winRatePct,
    numTrades: trades.length,
    avgWinPct,
    avgLossPct,
    sharpeRatio,
  };
}

function calculateSharpe(
  equityCurve: readonly EngineEquityPoint[],
  budget?: ExecutionBudget,
): number | null {
  if (equityCurve.length < 3) {
    return null;
  }

  let count = 0;
  let mean = 0;
  let sumSquaredDifferences = 0;
  for (let index = 1; index < equityCurve.length; index += 1) {
    checkBudget(budget, index);
    const previous = equityCurve[index - 1].equity;
    const current = equityCurve[index].equity;
    if (previous <= 0) {
      throw resourceError();
    }
    const value = (current - previous) / previous;
    assertFinite(value);

    count += 1;
    const delta = value - mean;
    mean += delta / count;
    sumSquaredDifferences += delta * (value - mean);
  }

  if (count < 2) {
    return null;
  }
  const variance = sumSquaredDifferences / (count - 1);
  if (variance === 0) {
    return null;
  }
  const sharpe = mean / Math.sqrt(variance);
  return Number.isFinite(sharpe) ? sharpe : null;
}

function assertFinite(value: number): void {
  if (!Number.isFinite(value)) {
    throw resourceError();
  }
}

function resourceError(): DomainError {
  return new DomainError(
    ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    'Backtest arithmetic exceeded the numeric range.',
  );
}
