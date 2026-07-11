import { JobsController } from './jobs.controller';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import type { AuthService } from '../auth/auth.service';

describe('JobsController', () => {
  it('creates and runs a job for the authenticated user', async () => {
    const job = {
      id: 'job-1',
      jobType: 'equity_daily_import' as const,
      userId: 'user-1',
      payload: { symbol: 'AAPL' },
      status: 'completed' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      finishedAt: new Date('2026-01-01T00:00:01.000Z'),
    };

    const createAndRun = jest.fn().mockResolvedValue(job);
    const toJobResponse = jest.fn().mockReturnValue({ id: 'job-1' });
    const requireUserBySessionToken = jest
      .fn()
      .mockReturnValue({ id: 'user-1' });

    const controller = new JobsController(
      { toJobResponse } as unknown as JobsService,
      { createAndRun } as unknown as JobHandlersService,
      { requireUserBySessionToken } as unknown as AuthService,
    );

    const request = { authToken: 'token-1' } as never;

    await expect(
      controller.createJob(request, {
        job_type: 'equity_daily_import',
        symbol: 'aapl',
      }),
    ).resolves.toEqual({ id: 'job-1' });

    expect(createAndRun).toHaveBeenCalledWith('equity_daily_import', 'user-1', {
      symbol: 'AAPL',
    });
  });

  it('returns a job for the authenticated owner', async () => {
    const job = {
      id: 'job-1',
      jobType: 'crypto_import' as const,
      userId: 'user-1',
      payload: {},
      status: 'completed' as const,
      createdAt: new Date(),
    };
    const getJobForUser = jest.fn().mockResolvedValue(job);
    const toJobResponse = jest.fn().mockReturnValue({ id: 'job-1' });
    const requireUserBySessionToken = jest
      .fn()
      .mockReturnValue({ id: 'user-1' });

    const controller = new JobsController(
      { getJobForUser, toJobResponse } as unknown as JobsService,
      {} as JobHandlersService,
      { requireUserBySessionToken } as unknown as AuthService,
    );

    await expect(
      controller.getJob({ authToken: 'token' } as never, 'job-1'),
    ).resolves.toEqual({ id: 'job-1' });
  });

  it('throws when the auth token is missing from the request context', async () => {
    const controller = new JobsController(
      {} as JobsService,
      {} as JobHandlersService,
      {} as AuthService,
    );

    await expect(
      controller.createJob({} as never, { job_type: 'equity_daily_import' }),
    ).rejects.toThrow('Auth token missing from request context.');
  });
});
