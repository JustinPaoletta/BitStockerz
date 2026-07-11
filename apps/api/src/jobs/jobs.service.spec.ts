import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobExecutorService } from './job-executor.service';
import { JobsService } from './jobs.service';
import type { JobHandler } from './jobs.types';

function createConfig(overrides?: Partial<AppConfigService>): AppConfigService {
  return {
    server: { nodeEnv: 'test', port: 4000 },
    dependencies: { databaseUrl: undefined },
    jobs: {
      timeoutMs: 50,
      schedulerEnabled: false,
      systemUserId: 'system-user',
    },
    ...overrides,
  } as AppConfigService;
}

describe('JobExecutorService', () => {
  it('runs a registered handler and marks the job completed', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    const handler: JobHandler = jest
      .fn()
      .mockResolvedValue({ imported_equity_bars: 3 });

    executor.registerHandler('equity_daily_import', handler);
    const job = await jobsService.createJob({
      jobType: 'equity_daily_import',
      userId: 'user-1',
    });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('completed');
    expect(result.payload.imported_equity_bars).toBe(3);
    expect(handler).toHaveBeenCalled();
  });

  it('marks jobs timed_out when handlers exceed the configured timeout', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    const handler: JobHandler = () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({}), 200);
      });

    executor.registerHandler('crypto_import', handler);
    const job = await jobsService.createJob({
      jobType: 'crypto_import',
      userId: 'user-1',
    });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('timed_out');
    expect(result.errorMessage).toContain('timed out');
  });

  it('marks jobs failed when no handler is registered', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    const job = await jobsService.createJob({
      jobType: 'market_data_scheduled',
      userId: 'user-1',
    });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('No handler registered');
  });

  it('marks jobs failed when handlers throw', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    executor.registerHandler('equity_daily_import', () => {
      throw new Error('boom');
    });
    const job = await jobsService.createJob({
      jobType: 'equity_daily_import',
      userId: 'user-1',
    });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('boom');
  });

  it('marks jobs failed when handlers reject with non-error values', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    executor.registerHandler('equity_daily_import', () =>
      Promise.reject(new Error('bad')),
    );
    const job = await jobsService.createJob({
      jobType: 'equity_daily_import',
      userId: 'user-1',
    });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('bad');
  });

  it('returns jobs that are not pending without re-running', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());
    const handler = jest.fn();
    executor.registerHandler('equity_daily_import', handler);
    const job = await jobsService.createJob({
      jobType: 'equity_daily_import',
      userId: 'user-1',
    });
    await jobsService.updateJob(job.id, { status: 'completed' });

    const result = await executor.execute(job.id);

    expect(result.status).toBe('completed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('throws when executing a missing job', async () => {
    const jobsService = new JobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());

    await expect(executor.execute('missing-job')).rejects.toThrow(
      'Job missing-job was not found.',
    );
  });
});

describe('JobsService', () => {
  it('stores jobs in memory when Prisma is disabled', async () => {
    const service = new JobsService(new PrismaService(createConfig()));

    const job = await service.createJob({
      jobType: 'equity_daily_import',
      userId: 'user-1',
      payload: { symbol: 'AAPL' },
    });

    await expect(
      service.getJobForUser(job.id, 'user-1'),
    ).resolves.toMatchObject({
      jobType: 'equity_daily_import',
      status: 'pending',
      payload: { symbol: 'AAPL' },
    });
  });

  it('throws NOT_FOUND when a user requests another users job', async () => {
    const service = new JobsService(new PrismaService(createConfig()));
    const job = await service.createJob({
      jobType: 'equity_daily_import',
      userId: 'owner',
    });

    try {
      await service.getJobForUser(job.id, 'other-user');
      fail('Expected getJobForUser to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('uses Prisma when enabled', async () => {
    const create = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn();
    const update = jest.fn().mockResolvedValue({});

    const prisma = {
      isEnabled: true,
      job: { create, findUnique, update },
    };

    const service = new JobsService(prisma as never);
    const job = await service.createJob({
      jobType: 'crypto_import',
      userId: 'user-1',
      payload: { symbol: 'BTC-USD' },
    });

    findUnique.mockResolvedValue({
      id: job.id,
      jobType: 'crypto_import',
      userId: 'user-1',
      payloadJson: { symbol: 'BTC-USD' },
      status: 'pending',
      errorMessage: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
    });

    expect(create).toHaveBeenCalled();
    await expect(
      service.getJobForUser(job.id, 'user-1'),
    ).resolves.toMatchObject({
      jobType: 'crypto_import',
    });
    expect(findUnique).toHaveBeenCalled();
  });

  it('updates jobs in Prisma when enabled', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({
      id: 'job-1',
      jobType: 'equity_daily_import',
      userId: 'user-1',
      payloadJson: {},
      status: 'pending',
      errorMessage: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
    });

    const prisma = {
      isEnabled: true,
      job: { create: jest.fn(), findUnique, update },
    };

    const service = new JobsService(prisma as never);
    const updated = await service.updateJob('job-1', {
      status: 'running',
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    expect(updated.status).toBe('running');
    expect(update).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when updating a missing job', async () => {
    const service = new JobsService(new PrismaService(createConfig()));

    try {
      await service.updateJob('missing-job', { status: 'failed' });
      fail('Expected updateJob to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('serializes optional timestamps in job responses', () => {
    const service = new JobsService(new PrismaService(createConfig()));

    expect(
      service.toJobResponse({
        id: 'job-1',
        jobType: 'equity_daily_import',
        userId: 'user-1',
        payload: {},
        status: 'completed',
        errorMessage: 'done',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        startedAt: new Date('2026-01-01T00:00:01.000Z'),
        finishedAt: new Date('2026-01-01T00:00:02.000Z'),
      }),
    ).toEqual({
      id: 'job-1',
      job_type: 'equity_daily_import',
      status: 'completed',
      payload: {},
      error_message: 'done',
      created_at: '2026-01-01T00:00:00.000Z',
      started_at: '2026-01-01T00:00:01.000Z',
      finished_at: '2026-01-01T00:00:02.000Z',
    });
  });
});
