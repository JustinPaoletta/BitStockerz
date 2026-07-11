import { IngestionController } from './ingestion.controller';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import type { AuthService } from '../auth/auth.service';

describe('IngestionController', () => {
  it('delegates equity ingestion to the job handlers service', async () => {
    const job = {
      id: 'job-1',
      jobType: 'equity_daily_import' as const,
      userId: 'user-1',
      payload: { symbol: 'AAPL', imported_equity_bars: 40 },
      status: 'completed' as const,
      createdAt: new Date(),
    };

    const createAndRun = jest.fn().mockResolvedValue(job);
    const toJobResponse = jest.fn().mockReturnValue({ id: 'job-1' });
    const requireUserBySessionToken = jest
      .fn()
      .mockReturnValue({ id: 'user-1' });

    const controller = new IngestionController(
      { createAndRun } as unknown as JobHandlersService,
      { toJobResponse } as unknown as JobsService,
      { requireUserBySessionToken } as unknown as AuthService,
    );

    await expect(
      controller.importEquity({ authToken: 'token' } as never, {
        symbol: 'aapl',
      }),
    ).resolves.toEqual({ id: 'job-1' });

    expect(createAndRun).toHaveBeenCalledWith('equity_daily_import', 'user-1', {
      symbol: 'AAPL',
    });
  });

  it('delegates crypto ingestion to the job handlers service', async () => {
    const createAndRun = jest.fn().mockResolvedValue({ id: 'job-2' });
    const toJobResponse = jest.fn().mockReturnValue({ id: 'job-2' });
    const requireUserBySessionToken = jest
      .fn()
      .mockReturnValue({ id: 'user-1' });

    const controller = new IngestionController(
      { createAndRun } as unknown as JobHandlersService,
      { toJobResponse } as unknown as JobsService,
      { requireUserBySessionToken } as unknown as AuthService,
    );

    await controller.importCrypto({ authToken: 'token' } as never, {
      symbol: 'btc-usd',
      intervals: ['1d'],
    });

    expect(createAndRun).toHaveBeenCalledWith('crypto_import', 'user-1', {
      symbol: 'BTC-USD',
      intervals: ['1d'],
    });
  });

  it('throws when the auth token is missing from the request context', async () => {
    const controller = new IngestionController(
      {} as JobHandlersService,
      {} as JobsService,
      {} as AuthService,
    );

    await expect(controller.importEquity({} as never, {})).rejects.toThrow(
      'Auth token missing from request context.',
    );
  });
});
