import type { ErrorCode } from '../common/errors/error-codes.enum';

export type JobStatus =
  'pending' | 'running' | 'completed' | 'failed' | 'timed_out' | 'cancelled';

export type JobType =
  | 'equity_daily_import'
  | 'crypto_import'
  | 'market_data_scheduled'
  | 'backtest_run';

export interface JobPayload {
  symbol?: string;
  intervals?: Array<'1d' | '1h'>;
  imported_equity_bars?: number;
  imported_crypto_daily_bars?: number;
  imported_crypto_hourly_bars?: number;
  error_code?: ErrorCode;
  [key: string]: unknown;
}

export interface JobRecord {
  id: string;
  jobType: JobType;
  userId: string;
  payload: JobPayload;
  status: JobStatus;
  errorMessage?: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface JobResponse {
  id: string;
  job_type: JobType;
  status: JobStatus;
  payload: JobPayload;
  error_message?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface CreateJobInput {
  jobType: JobType;
  userId: string;
  payload?: JobPayload;
}

export interface JobExecutionContext {
  signal: AbortSignal;
  /** Monotonic `performance.now()` deadline, not wall-clock time. */
  deadlineAtMs: number;
}

export type JobHandler = (
  job: JobRecord,
  context: JobExecutionContext,
) => Promise<JobPayload>;
