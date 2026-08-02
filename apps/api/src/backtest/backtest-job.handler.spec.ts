import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type {
  JobExecutionContext,
  JobHandler,
  JobRecord,
} from '../jobs/jobs.types';
import { BacktestJobHandler } from './backtest-job.handler';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const STRATEGY_ID = '33333333-3333-4333-8333-333333333333';

const job: JobRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  userId: USER_ID,
  jobType: 'backtest_run',
  status: 'pending',
  payload: { backtest_run_id: RUN_ID, request_id: 'request-1' },
  createdAt: new Date(),
};

const context = (): JobExecutionContext => ({
  signal: new AbortController().signal,
  deadlineAtMs: performance.now() + 5000,
});

function setup() {
  let registered: JobHandler | undefined;
  const executor = {
    registerHandler: jest.fn((_type: string, handler: JobHandler) => {
      registered = handler;
    }),
  };
  const run = {
    id: RUN_ID,
    userId: USER_ID,
    strategyId: STRATEGY_ID,
    strategyVersionId: 3,
    symbolId: 1,
    timeframe: '1d',
    startDate: new Date('2026-01-01T00:00:00Z'),
    endDate: new Date('2026-01-02T23:59:59.999Z'),
    initialEquity: '10000.00',
    status: 'running',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const backtests = {
    markRunning: jest.fn(),
    getRun: jest.fn(async () => ({
      run,
      result: null,
      trades: [],
      equityCurve: [],
    })),
    completeRun: jest.fn(),
    ensureTerminalFailure: jest.fn(),
  };
  const strategies = {
    resolvePinnedVersionForRun: jest.fn(async () => ({
      assetType: 'EQUITY',
      definition: { indicators: [] },
    })),
  };
  const marketData = {
    getSymbolsByIds: jest.fn(async () => [{ id: 1, symbol: 'AAPL' }]),
    getBacktestBars: jest.fn(async () => [
      {
        ts: new Date('2026-01-01T00:00:00Z'),
        open: 1,
        high: 1,
        low: 1,
        close: 1,
        volume: 1,
      },
    ]),
  };
  const output = {
    trades: [],
    equityCurve: [{ ts: new Date('2026-01-01T00:00:00Z'), equity: 10000 }],
    metrics: {
      finalEquity: 10000,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      numTrades: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      sharpeRatio: null,
    },
    diagnostics: {
      barsProcessed: 1,
      durationMs: 1,
      indicatorsComputed: 0,
      signalsFired: 0,
    },
  };
  const engine = { run: jest.fn(() => output) };
  new BacktestJobHandler(
    executor as never,
    backtests as never,
    strategies as never,
    marketData as never,
    engine as never,
    { backtest: { maxBars: 1 } } as never,
  );
  return {
    handler: registered!,
    backtests,
    strategies,
    marketData,
    engine,
    output,
  };
}

describe('BacktestJobHandler', () => {
  it('registers, executes, persists, and returns bounded diagnostics', async () => {
    const { handler, backtests, engine } = setup();
    const payload = await handler(job, context());
    expect(backtests.markRunning).toHaveBeenCalledWith(RUN_ID, USER_ID, job.id);
    expect(engine.run).toHaveBeenCalledWith(
      expect.objectContaining({
        initialEquity: 10000,
        symbolId: 1,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(backtests.completeRun).toHaveBeenCalled();
    expect(payload).toMatchObject({
      backtest_run_id: RUN_ID,
      diagnostics: { bars_processed: 1 },
    });
    expect(payload).not.toHaveProperty('bars');
    expect(payload).not.toHaveProperty('definition');
  });

  it('fails the run if loading crosses an abort boundary', async () => {
    const { handler, marketData, backtests } = setup();
    const controller = new AbortController();
    marketData.getBacktestBars.mockImplementationOnce(async () => {
      controller.abort(new DomainError(ErrorCode.BACKTEST_TIMEOUT));
      return [];
    });
    await expect(
      handler(job, {
        signal: controller.signal,
        deadlineAtMs: performance.now() + 100,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_TIMEOUT });
    expect(backtests.ensureTerminalFailure).toHaveBeenCalledWith(
      RUN_ID,
      USER_ID,
      expect.objectContaining({ code: ErrorCode.BACKTEST_TIMEOUT }),
    );
    expect(backtests.completeRun).not.toHaveBeenCalled();
  });

  it('enforces actual bar counts and handles absent resources safely', async () => {
    const first = setup();
    first.marketData.getBacktestBars.mockResolvedValueOnce([{}, {}]);
    await expect(first.handler(job, context())).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
    });

    const second = setup();
    second.backtests.getRun.mockResolvedValueOnce(null);
    await expect(second.handler(job, context())).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_NOT_FOUND,
    });

    const third = setup();
    third.marketData.getSymbolsByIds.mockResolvedValueOnce([]);
    await expect(third.handler(job, context())).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('rejects malformed payloads before starting a run', async () => {
    const { handler, backtests } = setup();
    await expect(
      handler({ ...job, payload: {} }, context()),
    ).rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    expect(backtests.markRunning).not.toHaveBeenCalled();
  });

  it('normalizes unknown engine failures and non-Domain abort reasons', async () => {
    const first = setup();
    first.engine.run.mockImplementationOnce(() => {
      throw new Error('secret');
    });
    await expect(first.handler(job, context())).rejects.toThrow('secret');
    expect(first.backtests.ensureTerminalFailure).toHaveBeenCalledWith(
      RUN_ID,
      USER_ID,
      { code: ErrorCode.INTERNAL_ERROR, message: 'Backtest execution failed.' },
    );

    const second = setup();
    const controller = new AbortController();
    controller.abort('timeout');
    await expect(
      second.handler(job, {
        signal: controller.signal,
        deadlineAtMs: performance.now(),
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_TIMEOUT });

    const third = setup();
    third.engine.run.mockImplementationOnce(() => {
      throw new Error('original failure');
    });
    third.backtests.ensureTerminalFailure.mockRejectedValueOnce(
      new Error('cleanup failure'),
    );
    await expect(third.handler(job, context())).rejects.toThrow(
      'original failure',
    );
  });
});
