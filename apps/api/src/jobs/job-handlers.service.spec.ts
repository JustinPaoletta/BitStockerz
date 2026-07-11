import type { AppConfigService } from '../../config/app-config.service';
import { MarketDataIngestionService } from '../../market-data/ingestion/market-data-ingestion.service';
import { JobExecutorService } from './job-executor.service';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';

describe('JobHandlersService', () => {
  it('registers handlers and runs scheduled imports', async () => {
    const ingestionService = {
      importEquityDaily: jest.fn().mockResolvedValue({
        symbolsProcessed: 3,
        importedBars: 120,
      }),
      importCrypto: jest.fn().mockResolvedValue({
        symbolsProcessed: 2,
        importedDailyBars: 60,
        importedHourlyBars: 96,
      }),
    } as unknown as MarketDataIngestionService;

    const jobsService = new JobsService({
      isEnabled: false,
    } as never);
    const executor = new JobExecutorService(jobsService, {
      jobs: {
        timeoutMs: 5000,
        schedulerEnabled: false,
        systemUserId: 'system',
      },
    } as AppConfigService);

    const handlers = new JobHandlersService(
      ingestionService,
      jobsService,
      executor,
      {
        jobs: {
          timeoutMs: 5000,
          schedulerEnabled: false,
          systemUserId: 'system-user',
        },
      } as AppConfigService,
    );

    const job = await handlers.runScheduledImports();

    expect(job.status).toBe('completed');
    expect(job.payload).toMatchObject({
      imported_equity_bars: 120,
      imported_crypto_daily_bars: 60,
      imported_crypto_hourly_bars: 96,
    });
  });

  it('runs equity and crypto import jobs through the executor', async () => {
    const ingestionService = {
      importEquityDaily: jest
        .fn()
        .mockResolvedValue({ symbolsProcessed: 1, importedBars: 40 }),
      importCrypto: jest.fn().mockResolvedValue({
        symbolsProcessed: 1,
        importedDailyBars: 30,
        importedHourlyBars: 48,
      }),
    } as unknown as MarketDataIngestionService;

    const jobsService = new JobsService({ isEnabled: false } as never);
    const executor = new JobExecutorService(jobsService, {
      jobs: {
        timeoutMs: 5000,
        schedulerEnabled: false,
        systemUserId: 'system',
      },
    } as AppConfigService);
    const handlers = new JobHandlersService(
      ingestionService,
      jobsService,
      executor,
      {
        jobs: {
          timeoutMs: 5000,
          schedulerEnabled: false,
          systemUserId: 'system-user',
        },
      } as AppConfigService,
    );

    const equityJob = await handlers.createAndRun(
      'equity_daily_import',
      'user-1',
      {
        symbol: 'AAPL',
      },
    );
    const cryptoJob = await handlers.createAndRun('crypto_import', 'user-1', {
      symbol: 'BTC-USD',
      intervals: ['1d', '1h'],
    });

    expect(equityJob.payload.imported_equity_bars).toBe(40);
    expect(cryptoJob.payload.imported_crypto_daily_bars).toBe(30);
  });

  it('runs imports without optional payload fields', async () => {
    const ingestionService = {
      importEquityDaily: jest
        .fn()
        .mockResolvedValue({ symbolsProcessed: 3, importedBars: 120 }),
      importCrypto: jest.fn().mockResolvedValue({
        symbolsProcessed: 2,
        importedDailyBars: 60,
        importedHourlyBars: 96,
      }),
    } as unknown as MarketDataIngestionService;

    const jobsService = new JobsService({ isEnabled: false } as never);
    const executor = new JobExecutorService(jobsService, {
      jobs: {
        timeoutMs: 5000,
        schedulerEnabled: false,
        systemUserId: 'system',
      },
    } as AppConfigService);
    const handlers = new JobHandlersService(
      ingestionService,
      jobsService,
      executor,
      {
        jobs: {
          timeoutMs: 5000,
          schedulerEnabled: false,
          systemUserId: 'system-user',
        },
      } as AppConfigService,
    );

    const equityJob = await handlers.createAndRun(
      'equity_daily_import',
      'user-1',
    );
    const cryptoJob = await handlers.createAndRun('crypto_import', 'user-1');

    expect(ingestionService.importEquityDaily).toHaveBeenCalledWith({});
    expect(ingestionService.importCrypto).toHaveBeenCalledWith({});
    expect(equityJob.status).toBe('completed');
    expect(cryptoJob.status).toBe('completed');
  });
});
