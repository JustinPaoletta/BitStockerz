import type { MetricsDomain } from './metrics.service';

/** Request property set when HTTP metrics were already recorded for this request. */
export const METRICS_HTTP_RECORDED = 'metricsHttpRecorded';

/** Request property set by RequestIdMiddleware for duration measurement. */
export const REQUEST_STARTED_AT_MS = 'requestStartedAtMs';

export function classifyMetricsDomain(path: string): MetricsDomain {
  const normalized = path.toLowerCase();
  if (normalized.includes('/auth') || normalized.includes('/me')) {
    return 'auth';
  }
  if (normalized.includes('/market-data')) {
    return 'market_data';
  }
  if (normalized.includes('/jobs')) {
    return 'jobs';
  }
  if (normalized.includes('/backtests')) {
    return 'backtest';
  }
  return 'unknown';
}
