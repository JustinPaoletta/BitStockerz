import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
import type {
  StrategyAssetType,
  StrategyTimeframe,
} from '../strategies/strategy.types';

export const BACKTEST_STATUSES = [
  'pending',
  'running',
  'completed',
  'failed',
  'timed_out',
] as const;

export type BacktestStatus = (typeof BACKTEST_STATUSES)[number];
export type BacktestTimeframe = StrategyTimeframe;

export interface CreateBacktestRunInput {
  userId: string;
  strategyId: string;
  strategyVersionId?: number;
  symbolId: number;
  timeframe: BacktestTimeframe;
  startDate: Date;
  endDate: Date;
  initialEquity: number;
  jobId?: string;
}

export interface BacktestRunRecord {
  id: string;
  userId: string;
  strategyId: string;
  strategyVersionId: number;
  symbolId: number;
  timeframe: BacktestTimeframe;
  startDate: Date;
  endDate: Date;
  initialEquity: string;
  status: BacktestStatus;
  jobId?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface BacktestResultRecord {
  finalEquity: string;
  totalReturnPct: string;
  maxDrawdownPct: string;
  winRatePct: string;
  numTrades: number;
  avgWinPct: string;
  avgLossPct: string;
  sharpeRatio: string | null;
}

export interface BacktestTradeRecord {
  symbolId: number;
  entryTime: Date;
  exitTime: Date;
  side: 'long';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  pnlAbs: string;
  pnlPct: string;
}

export interface BacktestEquityPointRecord {
  timestamp: Date;
  equity: string;
}

export interface BacktestRunDetail {
  run: BacktestRunRecord;
  result: BacktestResultRecord | null;
  trades: BacktestTradeRecord[];
  equityCurve: BacktestEquityPointRecord[];
}

export interface BacktestRunSummary {
  run: BacktestRunRecord;
  result: BacktestResultRecord | null;
}

export interface ListBacktestFilters {
  strategyId?: string;
  symbolId?: number;
  status?: BacktestStatus;
  limit?: number;
  offset?: number;
}

export interface ResolvedListBacktestFilters {
  strategyId?: string;
  symbolId?: number;
  status?: BacktestStatus;
  limit: number;
  offset: number;
}

export interface PinnedStrategyVersion {
  strategyId: string;
  strategyVersionId: number;
  versionNumber: number;
  assetType: StrategyAssetType;
  timeframe: BacktestTimeframe;
  definition: StrategyDefinition;
}

export interface BacktestCompletionRecord {
  result: BacktestResultRecord;
  trades: BacktestTradeRecord[];
  equityCurve: BacktestEquityPointRecord[];
  finishedAt: Date;
}

export interface BacktestFailureRecord {
  status: 'failed' | 'timed_out';
  errorMessage: string;
  finishedAt: Date;
}

export interface BacktestAggregateRecord {
  run: BacktestRunRecord;
  result: BacktestResultRecord | null;
  trades: BacktestTradeRecord[];
  equityCurve: BacktestEquityPointRecord[];
}
