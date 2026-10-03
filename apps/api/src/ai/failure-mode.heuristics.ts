import type {
  BacktestResultRecord,
  BacktestTradeRecord,
} from '../backtest/backtests.types';
import type { AiIssue, AiSeverity } from './ai.types';

export interface FailureModeInput {
  result: BacktestResultRecord;
  trades: BacktestTradeRecord[];
  barsProcessed?: number;
}

export function identifyFailureModes(input: FailureModeInput): AiIssue[] {
  const issues: AiIssue[] = [];
  const { result, trades, barsProcessed } = input;

  if (barsProcessed !== undefined && barsProcessed < 100) {
    issues.push({
      code: 'SHORT_SAMPLE',
      severity: 'HIGH',
      message: 'Fewer than 100 bars were processed; results may be unreliable.',
      evidence: [`bars_processed=${barsProcessed}`],
    });
  }

  if (result.numTrades < 5) {
    issues.push({
      code: 'TOO_FEW_TRADES',
      severity: 'HIGH',
      message: 'Fewer than 5 trades were executed.',
      evidence: [`num_trades=${result.numTrades}`],
    });
  }

  const maxDrawdown = Number(result.maxDrawdownPct);
  if (Number.isFinite(maxDrawdown) && maxDrawdown >= 25) {
    issues.push({
      code: 'HIGH_DRAWDOWN',
      severity: 'HIGH',
      message: 'Maximum drawdown is at least 25%.',
      evidence: [`max_drawdown_pct=${result.maxDrawdownPct}`],
    });
  }

  const totalReturn = Number(result.totalReturnPct);
  if (Number.isFinite(totalReturn) && totalReturn < 0) {
    issues.push({
      code: 'NEGATIVE_RETURN',
      severity: 'MEDIUM',
      message: 'Total return is negative over the tested range.',
      evidence: [`total_return_pct=${result.totalReturnPct}`],
    });
  }

  const concentrated = concentratedPnl(trades);
  if (concentrated) {
    issues.push(concentrated);
  }

  return issues.slice(0, 10);
}

export function mergeIssues(
  deterministic: AiIssue[],
  model: AiIssue[],
): AiIssue[] {
  const merged = new Map<string, AiIssue>();
  for (const issue of deterministic) {
    merged.set(issue.code, issue);
  }
  for (const issue of model) {
    if (merged.has(issue.code)) {
      continue;
    }
    const severity: AiSeverity =
      issue.severity === 'HIGH' ? 'MEDIUM' : issue.severity;
    merged.set(issue.code, {
      ...issue,
      severity,
      evidence: [...new Set(issue.evidence)].slice(0, 10),
    });
  }
  return [...merged.values()].slice(0, 10);
}

function concentratedPnl(trades: BacktestTradeRecord[]): AiIssue | undefined {
  const winners = trades
    .map((trade) => Number(trade.pnlAbs))
    .filter((pnl) => Number.isFinite(pnl) && pnl > 0);
  const totalPositive = winners.reduce((sum, pnl) => sum + pnl, 0);
  if (totalPositive <= 0 || winners.length === 0) {
    return undefined;
  }
  const maxWinner = Math.max(...winners);
  if (maxWinner / totalPositive <= 0.5) {
    return undefined;
  }
  return {
    code: 'CONCENTRATED_PNL',
    severity: 'MEDIUM',
    message:
      'One winning trade contributes more than 50% of total positive P&L.',
    evidence: [
      `max_winner_pnl_abs=${maxWinner.toFixed(2)}`,
      `total_positive_pnl_abs=${totalPositive.toFixed(2)}`,
    ],
  };
}
