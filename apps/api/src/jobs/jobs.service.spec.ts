import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JobExecutorService } from './job-executor.service';
import { JobsService } from './jobs.service';
import type { JobHandler } from './jobs.types';

function createAuthPersistenceMock(): Pick<AuthService, 'ensureUserPersisted'> {
  return { ensureUserPersisted: jest.fn().mockResolvedValue(undefined) };
}

function createJobsService(prisma: PrismaService): JobsService {
  return new JobsService(prisma, createAuthPersistenceMock() as AuthService);
}

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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
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
    const jobsService = createJobsService(new PrismaService(createConfig()));
    const executor = new JobExecutorService(jobsService, createConfig());

    await expect(executor.execute('missing-job')).rejects.toThrow(
      'Job missing-job was not found.',
    );
  });
});

describe('JobsService', () => {
  it('stores jobs in memory when Prisma is disabled', async () => {
    const service = createJobsService(new PrismaService(createConfig()));

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
    const service = createJobsService(new PrismaService(createConfig()));
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

    const auth = createAuthPersistenceMock();
    const prisma = {
      isEnabled: true,
      job: { create, findUnique, update },
    };

    const service = new JobsService(prisma as never, auth as AuthService);
    const job = await service.createJob({
      jobType: 'crypto_import',
      userId: 'user-1',
      payload: { symbol: 'BTC-USD' },
    });

    expect(auth.ensureUserPersisted).toHaveBeenCalledWith('user-1');

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

  it('returns undefined from getJobById when Prisma has no matching job', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const prisma = {
      isEnabled: true,
      job: { create: jest.fn(), findUnique, update: jest.fn() },
    };

    const service = new JobsService(
      prisma as never,
      createAuthPersistenceMock() as AuthService,
    );

    await expect(service.getJobById('missing-job')).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'missing-job' } });
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

    const service = new JobsService(
      prisma as never,
      createAuthPersistenceMock() as AuthService,
    );
    const updated = await service.updateJob('job-1', {
      status: 'running',
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
    });

    expect(updated.status).toBe('running');
    expect(update).toHaveBeenCalled();
  });

  it('persists null timestamps in Prisma when optional fields are absent', async () => {
    const update = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({
      id: 'job-1',
      jobType: 'equity_daily_import',
      userId: 'user-1',
      payloadJson: { symbol: 'AAPL' },
      status: 'running',
      errorMessage: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      startedAt: new Date('2026-01-01T00:00:01.000Z'),
      finishedAt: null,
    });

    const prisma = {
      isEnabled: true,
      job: { create: jest.fn(), findUnique, update },
    };

    const service = new JobsService(
      prisma as never,
      createAuthPersistenceMock() as AuthService,
    );
    await service.updateJob('job-1', {
      status: 'completed',
      finishedAt: new Date('2026-01-01T00:00:02.000Z'),
    });

    expect(update).toHaveBeenCalledWith({
      where: { id: 'job-1' },
      data: {
        status: 'completed',
        payloadJson: { symbol: 'AAPL' },
        errorMessage: null,
        startedAt: new Date('2026-01-01T00:00:01.000Z'),
        finishedAt: new Date('2026-01-01T00:00:02.000Z'),
      },
    });
  });

  it('throws NOT_FOUND when updating a missing job', async () => {
    const service = createJobsService(new PrismaService(createConfig()));

    try {
      await service.updateJob('missing-job', { status: 'failed' });
      fail('Expected updateJob to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('serializes optional timestamps in job responses', () => {
    const service = createJobsService(new PrismaService(createConfig()));

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
