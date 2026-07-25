import { Injectable } from '@nestjs/common';
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
      const message =
        error instanceof Error ? error.message : 'Job execution failed.';
      const status = message.includes('timed out') ? 'timed_out' : 'failed';
      const failed = await this.jobsService.updateJob(jobId, {
        status,
        errorMessage: message,
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
    const timeoutMs = this.config.jobs.timeoutMs;

    return new Promise<JobPayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job ${job.id} timed out after ${timeoutMs}ms.`));
      }, timeoutMs);

      handler(job)
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
