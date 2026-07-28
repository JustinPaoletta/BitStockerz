import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';

export interface EngineBar {
  ts: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BacktestLimits {
  maxBars?: number;
  timeoutMs?: number;
  maxSeriesCells?: number;
}

export interface BacktestEngineInput {
  definition: StrategyDefinition;
  bars: EngineBar[];
  initialEquity: number;
  symbolId?: number;
  signal?: AbortSignal;
  limits?: BacktestLimits;
}

export interface EngineTrade {
  entryTime: Date;
  exitTime: Date;
  side: 'long';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnlAbs: number;
  pnlPct: number;
  symbolId?: number;
}

export interface EngineEquityPoint {
  ts: Date;
  equity: number;
}

export interface EngineMetrics {
  finalEquity: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  numTrades: number;
  avgWinPct: number;
  avgLossPct: number;
  sharpeRatio: number | null;
}

export interface EngineDiagnostics {
  barsProcessed: number;
  durationMs: number;
  indicatorsComputed: number;
  signalsFired: number;
}

export interface BacktestEngineOutput {
  trades: EngineTrade[];
  equityCurve: EngineEquityPoint[];
  metrics: EngineMetrics;
  diagnostics: EngineDiagnostics;
}

export interface ResolvedBacktestLimits {
  maxBars: number;
  timeoutMs: number;
  maxSeriesCells: number;
}

export const DEFAULT_BACKTEST_LIMITS: Readonly<ResolvedBacktestLimits> = {
  maxBars: 10_000,
  timeoutMs: 5_000,
  maxSeriesCells: 250_000,
};
