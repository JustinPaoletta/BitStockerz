import type {
  BacktestDetailResponse,
  BacktestListResponse,
  BacktestResults,
  BacktestRun,
  ChartPoint,
  CreateBacktestResponse,
  EquityPoint,
} from './models/backtest.models';

export function mapBacktestDetail(value: unknown): BacktestDetailResponse {
  if (!isRecord(value)) {
    throw new Error('Backtest detail is missing run metadata.');
  }
  validateRun(value['run']);
  validateResults(value['results']);
  if (
    !Array.isArray(value['trades']) ||
    !Array.isArray(value['equity_curve']) ||
    !isRecord(value['trades_page'])
  ) {
    throw new Error('Backtest detail collections are invalid.');
  }
  const page = value['trades_page'];
  if (
    !isPositiveInteger(page['limit']) ||
    !isNonNegativeInteger(page['offset']) ||
    typeof page['has_more'] !== 'boolean'
  ) {
    throw new Error('Backtest trade pagination is invalid.');
  }
  for (const trade of value['trades']) {
    if (
      !isRecord(trade) ||
      !isPositiveInteger(trade['id']) ||
      !isPositiveInteger(trade['symbol_id']) ||
      trade['side'] !== 'long' ||
      !isIsoDate(trade['entry_time']) ||
      !isIsoDate(trade['exit_time']) ||
      !hasFiniteDecimalStrings(trade, [
        'entry_price',
        'exit_price',
        'quantity',
        'pnl_abs',
        'pnl_pct',
      ])
    ) {
      throw new Error('Backtest trade is invalid.');
    }
  }
  for (const point of value['equity_curve']) {
    if (
      !isRecord(point) ||
      !isFiniteDecimalString(point['equity']) ||
      !isIsoDate(point['timestamp'])
    ) {
      throw new Error('Backtest equity point is invalid.');
    }
  }
  return value as unknown as BacktestDetailResponse;
}

export function mapBacktestList(value: unknown): BacktestListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value['items']) ||
    !isPositiveInteger(value['limit']) ||
    !isNonNegativeInteger(value['offset']) ||
    typeof value['has_more'] !== 'boolean'
  ) {
    throw new Error('Backtest list response is invalid.');
  }
  for (const item of value['items']) {
    validateRun(item);
    if (
      !isRecord(item) ||
      typeof item['strategy_name'] !== 'string' ||
      !isOptionalFiniteDecimalString(item['total_return_pct']) ||
      !isOptionalFiniteDecimalString(item['max_drawdown_pct']) ||
      !isOptionalNonNegativeInteger(item['num_trades'])
    ) {
      throw new Error('Backtest list item is invalid.');
    }
  }
  return value as unknown as BacktestListResponse;
}

export function mapCreateBacktest(value: unknown): CreateBacktestResponse {
  if (!isRecord(value)) {
    throw new Error('Backtest response is invalid.');
  }
  validateRun(value['run']);
  validateResults(value['results']);
  return value as unknown as CreateBacktestResponse;
}

export function toChartPoints(points: EquityPoint[], timeframe: '1d' | '1h'): ChartPoint[] {
  return points.flatMap((point) => {
    const value = Number(point.equity);
    const milliseconds = Date.parse(point.timestamp);
    if (!Number.isFinite(value) || !Number.isFinite(milliseconds)) return [];
    return [
      {
        time:
          timeframe === '1d'
            ? new Date(milliseconds).toISOString().slice(0, 10)
            : Math.floor(milliseconds / 1000),
        value,
      },
    ];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRun(value: unknown): asserts value is BacktestRun {
  if (
    !isRecord(value) ||
    typeof value['id'] !== 'string' ||
    typeof value['strategy_id'] !== 'string' ||
    !isPositiveInteger(value['strategy_version_id']) ||
    typeof value['symbol'] !== 'string' ||
    !['1d', '1h'].includes(String(value['timeframe'])) ||
    !['pending', 'running', 'completed', 'failed', 'timed_out'].includes(String(value['status'])) ||
    !isIsoDate(value['start_date']) ||
    !isIsoDate(value['end_date']) ||
    !isIsoDate(value['created_at']) ||
    !isIsoDate(value['updated_at']) ||
    !isFiniteDecimalString(value['initial_equity'])
  ) {
    throw new Error('Backtest run metadata is invalid.');
  }
}

function validateResults(value: unknown): asserts value is BacktestResults | null {
  if (value === null) return;
  if (
    !isRecord(value) ||
    !hasFiniteDecimalStrings(value, [
      'final_equity',
      'total_return_pct',
      'max_drawdown_pct',
      'win_rate_pct',
      'avg_win_pct',
      'avg_loss_pct',
    ]) ||
    !isNonNegativeInteger(value['num_trades']) ||
    !(value['sharpe_ratio'] === null || isFiniteDecimalString(value['sharpe_ratio']))
  ) {
    throw new Error('Backtest results are invalid.');
  }
}

function hasFiniteDecimalStrings(value: Record<string, unknown>, fields: string[]): boolean {
  return fields.every((field) => isFiniteDecimalString(value[field]));
}

function isFiniteDecimalString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value));
}

function isOptionalFiniteDecimalString(value: unknown): boolean {
  return value === undefined || isFiniteDecimalString(value);
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOptionalNonNegativeInteger(value: unknown): boolean {
  return value === undefined || isNonNegativeInteger(value);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
