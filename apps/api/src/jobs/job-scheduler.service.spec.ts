import { JobSchedulerService } from './job-scheduler.service';
import type { JobHandlersService } from './job-handlers.service';

describe('JobSchedulerService', () => {
  it('skips scheduled ingestion when the scheduler is disabled', async () => {
    const runScheduledImports = jest.fn();
    const scheduler = new JobSchedulerService(
      {
        jobs: {
          schedulerEnabled: false,
          timeoutMs: 1000,
          systemUserId: 'system',
        },
      } as never,
      { runScheduledImports } as unknown as JobHandlersService,
    );

    await scheduler.runMarketDataIngestion();

    expect(runScheduledImports).not.toHaveBeenCalled();
  });

  it('runs scheduled ingestion when enabled', async () => {
    const runScheduledImports = jest.fn().mockResolvedValue({
      id: 'job-1',
      status: 'completed',
    });
    const scheduler = new JobSchedulerService(
      {
        jobs: {
          schedulerEnabled: true,
          timeoutMs: 1000,
          systemUserId: 'system',
        },
      } as never,
      { runScheduledImports } as unknown as JobHandlersService,
    );

    await scheduler.runMarketDataIngestion();

    expect(runScheduledImports).toHaveBeenCalled();
  });

  it('logs scheduler failures without throwing', async () => {
    const runScheduledImports = jest
      .fn()
      .mockRejectedValue(new Error('scheduler failed'));
    const scheduler = new JobSchedulerService(
      {
        jobs: {
          schedulerEnabled: true,
          timeoutMs: 1000,
          systemUserId: 'system',
        },
      } as never,
      { runScheduledImports } as unknown as JobHandlersService,
    );

    await expect(scheduler.runMarketDataIngestion()).resolves.toBeUndefined();
  });
});
