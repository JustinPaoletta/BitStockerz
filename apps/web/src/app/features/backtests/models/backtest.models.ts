export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timed_out';

export interface BacktestRun {
  id: string;
  strategy_id: string;
  strategy_version_id: number;
  symbol: string;
  timeframe: '1d' | '1h';
  start_date: string;
  end_date: string;
  initial_equity: string;
  status: BacktestStatus;
  job_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
  diagnostics?: BacktestDiagnostics;
}

export interface BacktestDiagnostics {
  bars_processed: number;
  duration_ms: number;
  indicators_computed: number;
  signals_fired: number;
}

export interface BacktestResults {
  final_equity: string;
  total_return_pct: string;
  max_drawdown_pct: string;
  win_rate_pct: string;
  num_trades: number;
  avg_win_pct: string;
  avg_loss_pct: string;
  sharpe_ratio: string | null;
}

export interface BacktestTrade {
  id: number;
  symbol_id: number;
  entry_time: string;
  exit_time: string;
  side: 'long';
  entry_price: string;
  exit_price: string;
  quantity: string;
  pnl_abs: string;
  pnl_pct: string;
}

export interface EquityPoint {
  timestamp: string;
  equity: string;
}

export interface BacktestDetailResponse {
  run: BacktestRun;
  results: BacktestResults | null;
  trades: BacktestTrade[];
  trades_page: { limit: number; offset: number; has_more: boolean };
  equity_curve: EquityPoint[];
}

export interface BacktestListItem extends BacktestRun {
  strategy_name: string;
  total_return_pct?: string;
  max_drawdown_pct?: string;
  num_trades?: number;
}

export interface BacktestListResponse {
  items: BacktestListItem[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface CreateBacktestRequest {
  strategy_id: string;
  symbol: string;
  timeframe: '1d' | '1h';
  start_date: string;
  end_date: string;
  initial_equity: number;
}

export interface CreateBacktestResponse {
  run: BacktestRun;
  results: BacktestResults | null;
}

export interface ProblemDetails {
  detail?: string;
  code?: string;
}

export interface ChartPoint {
  time: string | number;
  value: number;
}
