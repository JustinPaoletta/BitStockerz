import { Injectable } from '@nestjs/common';
import type { Job as PrismaJob, Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateJobInput,
  JobPayload,
  JobRecord,
  JobResponse,
  JobStatus,
  JobType,
} from './jobs.types';

@Injectable()
export class JobsService {
  private readonly inMemoryJobs = new Map<string, JobRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createJob(input: CreateJobInput): Promise<JobRecord> {
    const now = new Date();
    const record: JobRecord = {
      id: crypto.randomUUID(),
      jobType: input.jobType,
      userId: input.userId,
      payload: input.payload ?? {},
      status: 'pending',
      createdAt: now,
    };

    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(input.userId);
      await this.prisma.job.create({
        data: toPrismaCreate(record),
      });
      return record;
    }

    this.inMemoryJobs.set(record.id, record);
    return record;
  }

  async getJobForUser(jobId: string, userId: string): Promise<JobRecord> {
    const record = await this.findJobById(jobId);
    if (!record || record.userId !== userId) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Job ${jobId} was not found.`);
    }

    return record;
  }

  async getJobById(jobId: string): Promise<JobRecord | undefined> {
    return this.findJobById(jobId);
  }

  async updateJob(
    jobId: string,
    update: Partial<
      Pick<
        JobRecord,
        'status' | 'payload' | 'errorMessage' | 'startedAt' | 'finishedAt'
      >
    >,
  ): Promise<JobRecord> {
    const existing = await this.findJobById(jobId);
    if (!existing) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Job ${jobId} was not found.`);
    }

    const next: JobRecord = {
      ...existing,
      ...update,
      payload: update.payload ?? existing.payload,
    };

    if (this.prisma.isEnabled) {
      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: next.status,
          payloadJson: next.payload as Prisma.InputJsonValue,
          errorMessage: next.errorMessage ?? null,
          startedAt: next.startedAt ?? null,
          finishedAt: next.finishedAt ?? null,
        },
      });
      return next;
    }

    this.inMemoryJobs.set(jobId, next);
    return next;
  }

  toJobResponse(record: JobRecord): JobResponse {
    return {
      id: record.id,
      job_type: record.jobType,
      status: record.status,
      payload: record.payload,
      error_message: record.errorMessage,
      created_at: record.createdAt.toISOString(),
      started_at: record.startedAt?.toISOString(),
      finished_at: record.finishedAt?.toISOString(),
    };
  }

  private async findJobById(jobId: string): Promise<JobRecord | undefined> {
    if (this.prisma.isEnabled) {
      const record = await this.prisma.job.findUnique({ where: { id: jobId } });
      return record ? fromPrismaJob(record) : undefined;
    }

    return this.inMemoryJobs.get(jobId);
  }
}

function fromPrismaJob(record: PrismaJob): JobRecord {
  return {
    id: record.id,
    jobType: record.jobType as JobType,
    userId: record.userId,
    payload: record.payloadJson as JobPayload,
    status: record.status as JobStatus,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt,
    startedAt: record.startedAt ?? undefined,
    finishedAt: record.finishedAt ?? undefined,
  };
}

function toPrismaCreate(record: JobRecord): Prisma.JobUncheckedCreateInput {
  return {
    id: record.id,
    jobType: record.jobType,
    userId: record.userId,
    payloadJson: record.payload as Prisma.InputJsonValue,
    status: record.status,
    createdAt: record.createdAt,
  };
}
