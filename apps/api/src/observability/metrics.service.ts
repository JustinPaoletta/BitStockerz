import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export type MetricsDomain =
  'auth' | 'market_data' | 'jobs' | 'backtest' | 'unknown';
export type JobTerminalStatus = 'completed' | 'failed' | 'timed_out';
export type BacktestTerminalStatus = JobTerminalStatus;

export interface DurationStats {
  count: number;
  avg: number;
  p95: number;
  max: number;
}

export interface MetricsSnapshot {
  timestamp: string;
  http: {
    request_count: number;
    error_count: number;
    duration_ms: DurationStats;
  };
  jobs: {
    by_type: Record<
      string,
      {
        completed: number;
        failed: number;
        timed_out: number;
        duration_ms: DurationStats;
      }
    >;
  };
  backtests: {
    completed: number;
    failed: number;
    timed_out: number;
    duration_ms: DurationStats;
  };
  cache: {
    symbols: CacheNamespaceStats;
    candles: CacheNamespaceStats;
  };
  errors_by_domain: Record<MetricsDomain, number>;
}

export type CacheMetricEvent = 'hit' | 'miss' | 'load_error' | 'eviction';

export interface CacheNamespaceStats {
  hit: number;
  miss: number;
  load_error: number;
  eviction: number;
}

const MAX_SAMPLES = 500;

@Injectable()
export class MetricsService {
  private httpRequestCount = 0;
  private httpErrorCount = 0;
  private readonly httpDurations: number[] = [];
  private readonly jobDurations = new Map<string, number[]>();
  private readonly jobCounts = new Map<
    string,
    { completed: number; failed: number; timed_out: number }
  >();
  private readonly backtestDurations: number[] = [];
  private readonly backtestCounts = {
    completed: 0,
    failed: 0,
    timed_out: 0,
  };
  private readonly cacheStats: Record<
    'symbols' | 'candles',
    CacheNamespaceStats
  > = {
    symbols: { hit: 0, miss: 0, load_error: 0, eviction: 0 },
    candles: { hit: 0, miss: 0, load_error: 0, eviction: 0 },
  };
  private readonly errorsByDomain: Record<MetricsDomain, number> = {
    auth: 0,
    market_data: 0,
    jobs: 0,
    backtest: 0,
    unknown: 0,
  };

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.metrics.enabled;
  }

  recordHttp(durationMs: number, isError: boolean): void {
    if (!this.enabled) {
      return;
    }

    this.httpRequestCount += 1;
    if (isError) {
      this.httpErrorCount += 1;
    }
    pushBounded(this.httpDurations, durationMs, MAX_SAMPLES);
  }

  recordJob(
    jobType: string,
    status: JobTerminalStatus,
    durationMs: number,
  ): void {
    if (!this.enabled) {
      return;
    }

    const counts = this.jobCounts.get(jobType) ?? {
      completed: 0,
      failed: 0,
      timed_out: 0,
    };
    counts[status] += 1;
    this.jobCounts.set(jobType, counts);

    const samples = this.jobDurations.get(jobType) ?? [];
    pushBounded(samples, durationMs, MAX_SAMPLES);
    this.jobDurations.set(jobType, samples);
  }

  recordError(domain: MetricsDomain): void {
    if (!this.enabled) {
      return;
    }

    this.errorsByDomain[domain] += 1;
  }

  recordBacktest(status: BacktestTerminalStatus, durationMs: number): void {
    if (!this.enabled) {
      return;
    }

    this.backtestCounts[status] += 1;
    pushBounded(this.backtestDurations, durationMs, MAX_SAMPLES);
  }

  recordCache(namespace: 'symbols' | 'candles', event: CacheMetricEvent): void {
    if (!this.enabled) {
      return;
    }
    this.cacheStats[namespace][event] += 1;
  }

  snapshot(now = new Date()): MetricsSnapshot {
    const byType: MetricsSnapshot['jobs']['by_type'] = {};

    for (const [jobType, counts] of this.jobCounts.entries()) {
      byType[jobType] = {
        ...counts,
        duration_ms: summarize(this.jobDurations.get(jobType) ?? []),
      };
    }

    return {
      timestamp: now.toISOString(),
      http: {
        request_count: this.httpRequestCount,
        error_count: this.httpErrorCount,
        duration_ms: summarize(this.httpDurations),
      },
      jobs: { by_type: byType },
      backtests: {
        ...this.backtestCounts,
        duration_ms: summarize(this.backtestDurations),
      },
      cache: {
        symbols: { ...this.cacheStats.symbols },
        candles: { ...this.cacheStats.candles },
      },
      errors_by_domain: { ...this.errorsByDomain },
    };
  }

  resetForTests(): void {
    this.httpRequestCount = 0;
    this.httpErrorCount = 0;
    this.httpDurations.length = 0;
    this.jobDurations.clear();
    this.jobCounts.clear();
    this.backtestDurations.length = 0;
    this.backtestCounts.completed = 0;
    this.backtestCounts.failed = 0;
    this.backtestCounts.timed_out = 0;
    this.cacheStats.symbols = { hit: 0, miss: 0, load_error: 0, eviction: 0 };
    this.cacheStats.candles = { hit: 0, miss: 0, load_error: 0, eviction: 0 };
    this.errorsByDomain.auth = 0;
    this.errorsByDomain.market_data = 0;
    this.errorsByDomain.jobs = 0;
    this.errorsByDomain.backtest = 0;
    this.errorsByDomain.unknown = 0;
  }
}

function pushBounded(samples: number[], value: number, max: number): void {
  samples.push(value);
  if (samples.length > max) {
    samples.splice(0, samples.length - max);
  }
}

function summarize(samples: number[]): DurationStats {
  if (samples.length === 0) {
    return { count: 0, avg: 0, p95: 0, max: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const p95Index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.95) - 1),
  );

  return {
    count: sorted.length,
    avg: Number((sum / sorted.length).toFixed(2)),
    p95: sorted[p95Index],
    max: sorted[sorted.length - 1],
  };
}
