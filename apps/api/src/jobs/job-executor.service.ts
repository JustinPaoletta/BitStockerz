import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ERROR_CATALOG } from '../common/errors/error-catalog';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../observability/audit.service';
import type { JobTerminalStatus } from '../observability/metrics.service';
import { MetricsService } from '../observability/metrics.service';
import { JobsService } from './jobs.service';
import type { JobHandler, JobPayload, JobRecord } from './jobs.types';

@Injectable()
export class JobExecutorService {
  private readonly handlers = new Map<string, JobHandler>();

  constructor(
    private readonly jobsService: JobsService,
    private readonly config: AppConfigService,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  async execute(jobId: string): Promise<JobRecord> {
    const job = await this.jobsService.getJobById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} was not found.`);
    }

    if (job.status !== 'pending') {
      return job;
    }

    const handler = this.handlers.get(job.jobType);
    if (!handler) {
      const failed = await this.jobsService.updateJob(jobId, {
        status: 'failed',
        payload: {
          ...job.payload,
          error_code: ErrorCode.INTERNAL_ERROR,
        },
        errorMessage: `No handler registered for job_type ${job.jobType}.`,
        finishedAt: new Date(),
      });
      this.observeTerminal(failed, 0);
      return failed;
    }

    const startedAt = new Date();
    await this.jobsService.updateJob(jobId, {
      status: 'running',
      startedAt,
    });

    try {
      const result = await this.runWithTimeout(handler, job);
      const completed = await this.jobsService.updateJob(jobId, {
        status: 'completed',
        payload: result,
        finishedAt: new Date(),
      });
      this.observeTerminal(completed, startedAt.getTime());
      return completed;
    } catch (error) {
      const failure = normalizeJobFailure(error);
      const status = failure.timedOut ? 'timed_out' : 'failed';
      const failed = await this.jobsService.updateJob(jobId, {
        status,
        payload: {
          ...job.payload,
          ...(failure.code ? { error_code: failure.code } : {}),
        },
        errorMessage: failure.message,
        finishedAt: new Date(),
      });
      this.observeTerminal(failed, startedAt.getTime());
      return failed;
    }
  }

  private observeTerminal(job: JobRecord, startedAtMs: number): void {
    const finishedAtMs = job.finishedAt?.getTime() ?? Date.now();
    const durationMs = Math.max(
      0,
      finishedAtMs - (startedAtMs || finishedAtMs),
    );
    const status = job.status as JobTerminalStatus;

    if (
      status === 'completed' ||
      status === 'failed' ||
      status === 'timed_out'
    ) {
      this.metrics.recordJob(job.jobType, status, durationMs);
      void this.audit.record({
        userId: job.userId,
        eventType: status === 'completed' ? 'job.completed' : 'job.failed',
        payload: {
          job_id: job.id,
          job_type: job.jobType,
          status,
          duration_ms: durationMs,
        },
      });
    }
  }

  private async runWithTimeout(
    handler: JobHandler,
    job: JobRecord,
  ): Promise<JobPayload> {
    const timeoutMs =
      job.jobType === 'backtest_run'
        ? this.config.backtest.timeoutMs
        : this.config.jobs.timeoutMs;
    const controller = new AbortController();
    const deadlineAtMs = performance.now() + timeoutMs;

    return new Promise<JobPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        const timeoutError =
          job.jobType === 'backtest_run'
            ? new DomainError(ErrorCode.BACKTEST_TIMEOUT)
            : new JobTimeoutError();
        controller.abort(timeoutError);
        reject(timeoutError);
      }, timeoutMs);

      Promise.resolve()
        .then(() =>
          handler(job, {
            signal: controller.signal,
            deadlineAtMs,
          }),
        )
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}

function normalizeJobFailure(error: unknown): {
  code?: ErrorCode;
  message: string;
  timedOut: boolean;
} {
  if (error instanceof DomainError) {
    const response = error.getResponse() as { message?: string };
    return {
      code: error.code,
      message:
        response.message ??
        ERROR_CATALOG[error.code].defaultDetail ??
        'Job execution failed.',
      timedOut: error.code === ErrorCode.BACKTEST_TIMEOUT,
    };
  }
  if (error instanceof JobTimeoutError) {
    return {
      message: 'Job execution timed out.',
      timedOut: true,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message:
      ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail ??
      'Job execution failed.',
    timedOut: false,
  };
}

class JobTimeoutError extends Error {
  constructor() {
    super('Job execution timed out.');
    this.name = 'JobTimeoutError';
  }
}
