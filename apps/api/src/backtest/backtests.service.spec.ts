import { Test } from '@nestjs/testing';
import type { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import type { JobsService } from '../jobs/jobs.service';
import type { MarketDataService } from '../market-data/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
import { StrategiesService } from '../strategies/strategies.service';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { BacktestModule } from './backtest.module';
import { BacktestsRepository } from './backtests.repository';
import { BacktestsService } from './backtests.service';
import type { CreateBacktestRunInput } from './backtests.types';
import { runBacktest } from './engine/run';
import type {
  BacktestEngineOutput,
  EngineBar,
} from './engine/backtest-engine.types';
import { calculateMetrics } from './engine/metrics';
import { StrategyVersionPinningService } from './strategy-version-pinning';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000010';

describe('BacktestsService', () => {
  it('round-trips deterministic engine output in memory', async () => {
    const { service } = createService();
    const run = await service.createRun(createInput());
    await service.markRunning(run.id, USER_ID);
    await service.completeRun(run.id, USER_ID, engineOutput());

    const detail = await service.getRun(run.id, USER_ID);
    expect(detail).toMatchObject({
      run: {
        id: run.id,
        strategyId: STRATEGY_ID,
        strategyVersionId: 2,
        initialEquity: '1000.00',
        status: 'completed',
      },
      result: {
        finalEquity: '1100.00',
        totalReturnPct: '10.0000',
        numTrades: 1,
      },
      trades: [
        {
          symbolId: 1,
          entryPrice: '100.00000000',
          exitPrice: '110.00000000',
          pnlAbs: '100.00000000',
        },
      ],
      equityCurve: [{ equity: '1000.00' }, { equity: '1100.00' }],
    });
    await expect(service.getTrades(run.id, USER_ID)).resolves.toHaveLength(1);
    await expect(service.getEquityCurve(run.id, USER_ID)).resolves.toHaveLength(
      2,
    );
    await expect(
      service.listRuns(USER_ID, { status: 'completed' }),
    ).resolves.toMatchObject([{ run: { id: run.id } }]);
  });

  it('provides validated list/detail pages and idempotent terminal cleanup', async () => {
    const { service } = createService();
    const run = await service.createRun(createInput());
    await expect(
      service.listRunPage(USER_ID, { limit: 1, offset: 0 }),
    ).resolves.toMatchObject({
      items: [{ run: { id: run.id } }],
      limit: 1,
      offset: 0,
      hasMore: false,
    });
    await expect(
      service.getRunPage(run.id, USER_ID, 0, 0),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.getRunPage(run.id, USER_ID, 1, 100_001),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });

    await service.ensureTerminalFailure(run.id, USER_ID, {
      code: ErrorCode.BACKTEST_TIMEOUT,
      message: 'deadline',
    });
    await expect(
      service.getRunPage(run.id, USER_ID, 1, 0),
    ).resolves.toMatchObject({
      run: { status: 'timed_out' },
      tradesPage: { limit: 1, offset: 0, hasMore: false },
    });
    await expect(
      service.ensureTerminalFailure(run.id, USER_ID, {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'late',
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.ensureTerminalFailure(crypto.randomUUID(), USER_ID, {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'missing',
      }),
    ).resolves.toBeUndefined();
  });

  it('pins requested versions while enforcing latest-version timeframe metadata', async () => {
    const { service, resolve, requireActiveSymbolById } = createService();
    await service.createRun({
      ...createInput(),
      strategyVersionId: 1,
    });
    expect(resolve).toHaveBeenCalledWith(USER_ID, STRATEGY_ID, 1);

    resolve.mockResolvedValueOnce({
      strategyId: STRATEGY_ID,
      strategyVersionId: 2,
      versionNumber: 2,
      assetType: 'CRYPTO',
      timeframe: '1h',
      definition: definition(),
    });
    await expect(service.createRun(createInput())).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      fieldErrors: [
        expect.objectContaining({
          field: 'timeframe',
        }),
      ],
    });

    resolve.mockResolvedValueOnce({
      strategyId: STRATEGY_ID,
      strategyVersionId: 1,
      versionNumber: 1,
      assetType: 'CRYPTO',
      timeframe: '1h',
      definition: definition(),
    });
    requireActiveSymbolById.mockResolvedValueOnce({
      id: 4,
      symbol: 'BTC-USD',
      asset_type: 'CRYPTO',
      is_active: true,
    });
    await expect(
      service.createRun({
        ...createInput(),
        strategyVersionId: 1,
        symbolId: 4,
        timeframe: '1d',
      }),
    ).resolves.toMatchObject({
      strategyVersionId: 1,
      symbolId: 4,
      timeframe: '1d',
    });
  });

  it('requires a compatible active symbol and owner-scoped optional job link', async () => {
    const { service, resolve, requireActiveSymbolById, getJobForUser } =
      createService();
    requireActiveSymbolById.mockRejectedValueOnce(
      new DomainError(ErrorCode.NOT_FOUND, 'Symbol was not found.'),
    );
    await expect(
      service.createRun({ ...createInput(), symbolId: 999 }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    requireActiveSymbolById.mockResolvedValueOnce({
      id: 4,
      symbol: 'BTC-USD',
      asset_type: 'CRYPTO',
      is_active: true,
    });
    await expect(
      service.createRun({ ...createInput(), symbolId: 4 }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      fieldErrors: [expect.objectContaining({ field: 'symbolId' })],
    });

    resolve.mockResolvedValueOnce({
      strategyId: STRATEGY_ID,
      strategyVersionId: 2,
      versionNumber: 2,
      assetType: 'EQUITY',
      timeframe: '1h',
      definition: definition(),
    });
    requireActiveSymbolById.mockResolvedValueOnce({
      id: 1,
      symbol: 'AAPL',
      asset_type: 'EQUITY',
      is_active: true,
    });
    await expect(
      service.createRun({
        ...createInput(),
        strategyVersionId: 2,
        timeframe: '1h',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      fieldErrors: [expect.objectContaining({ field: 'timeframe' })],
    });

    const jobId = '00000000-0000-4000-8000-000000000030';
    getJobForUser.mockRejectedValueOnce(
      new DomainError(ErrorCode.NOT_FOUND, 'Job was not found.'),
    );
    await expect(
      service.createRun({ ...createInput(), jobId }),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    expect(getJobForUser).toHaveBeenCalledWith(jobId, USER_ID);
  });

  it.each([
    ['missing body', null, 'body'],
    ['invalid user', { userId: 'not-a-uuid' }, 'userId'],
    ['invalid strategy', { strategyId: 'not-a-uuid' }, 'strategyId'],
    ['invalid job', { jobId: 'not-a-uuid' }, 'jobId'],
    ['invalid version', { strategyVersionId: 0 }, 'strategyVersionId'],
    ['invalid symbol', { symbolId: 0 }, 'symbolId'],
    ['invalid timeframe', { timeframe: '5m' }, 'timeframe'],
    [
      'reversed range',
      {
        startDate: new Date('2026-01-03T00:00:00.000Z'),
        endDate: new Date('2026-01-02T00:00:00.000Z'),
      },
      'endDate',
    ],
    ['invalid date', { startDate: new Date(Number.NaN) }, 'startDate'],
    ['invalid equity', { initialEquity: 0 }, 'initialEquity'],
    ['over-precise equity', { initialEquity: 1_000.005 }, 'initialEquity'],
  ])('rejects %s before persistence', async (_name, override, field) => {
    const { service } = createService();
    const input =
      override === null
        ? (null as unknown as CreateBacktestRunInput)
        : {
            ...createInput(),
            ...(override as Partial<CreateBacktestRunInput>),
          };
    await expect(service.createRun(input)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      fieldErrors: [expect.objectContaining({ field })],
    });
  });

  it('stores only bounded public failure messages and no result rows', async () => {
    const { service } = createService();
    const failed = await service.createRun(createInput());
    await service.markRunning(failed.id, USER_ID);
    await service.failRun(failed.id, USER_ID, {
      code: 'SQL_FAILURE',
      message: 'SELECT secret FROM definitions\\nstack trace',
    });
    expect(await service.getRun(failed.id, USER_ID)).toMatchObject({
      run: {
        status: 'failed',
        errorMessage: '[INTERNAL_ERROR] An unexpected error occurred.',
      },
      result: null,
      trades: [],
      equityCurve: [],
    });

    const timedOut = await service.createRun(createInput());
    await service.markRunning(timedOut.id, USER_ID);
    await service.failRun(timedOut.id, USER_ID, {
      code: ErrorCode.BACKTEST_TIMEOUT,
      message: 'private details',
    });
    expect(await service.getRun(timedOut.id, USER_ID)).toMatchObject({
      run: {
        status: 'timed_out',
        errorMessage:
          '[BACKTEST_TIMEOUT] The backtest exceeded its execution deadline.',
      },
    });
  });

  it('hides cross-user reads and rejects cross-user or repeated writes', async () => {
    const { service } = createService();
    const run = await service.createRun(createInput());

    await expect(service.getRun(run.id, OTHER_USER_ID)).resolves.toBeNull();
    await expect(
      service.getTrades(run.id, OTHER_USER_ID),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });
    await expect(
      service.markRunning(run.id, OTHER_USER_ID),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });
    await expect(
      service.markRunning(run.id, USER_ID, 'not-a-uuid'),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
      fieldErrors: [expect.objectContaining({ field: 'jobId' })],
    });
    await expect(
      service.completeRun(
        '00000000-0000-4000-8000-000000000099',
        USER_ID,
        engineOutput(),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });
    await expect(
      service.getEquityCurve(run.id, OTHER_USER_ID),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });

    const jobId = '00000000-0000-4000-8000-000000000030';
    await service.markRunning(run.id, USER_ID, jobId);
    await service.completeRun(run.id, USER_ID, engineOutput());
    await expect(
      service.completeRun(
        run.id,
        USER_ID,
        null as unknown as BacktestEngineOutput,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
    await expect(
      service.completeRun(run.id, USER_ID, engineOutput()),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
  });

  it.each([
    [
      'empty curve',
      (output: BacktestEngineOutput) => {
        output.equityCurve = [];
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'trade count mismatch',
      (output: BacktestEngineOutput) => {
        output.metrics.numTrades = 0;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'wrong trade symbol',
      (output: BacktestEngineOutput) => {
        output.trades[0].symbolId = 2;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'trade absolute P&L mismatch',
      (output: BacktestEngineOutput) => {
        output.trades[0].pnlAbs = 0;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'trade percentage P&L mismatch',
      (output: BacktestEngineOutput) => {
        output.trades[0].pnlPct = 0;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'non-finite equity',
      (output: BacktestEngineOutput) => {
        output.metrics.finalEquity = Number.POSITIVE_INFINITY;
        output.equityCurve.at(-1)!.equity = Number.POSITIVE_INFINITY;
      },
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    ],
    [
      'unsorted equity',
      (output: BacktestEngineOutput) => {
        output.equityCurve.reverse();
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'missing trade array',
      (output: BacktestEngineOutput) => {
        output.trades = undefined as never;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'missing metrics',
      (output: BacktestEngineOutput) => {
        output.metrics = undefined as never;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'negative trade count',
      (output: BacktestEngineOutput) => {
        output.metrics.numTrades = -1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'invalid drawdown',
      (output: BacktestEngineOutput) => {
        output.metrics.maxDrawdownPct = -1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'drawdown above 100%',
      (output: BacktestEngineOutput) => {
        output.metrics.maxDrawdownPct = 101;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'invalid win rate',
      (output: BacktestEngineOutput) => {
        output.metrics.winRatePct = 101;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'bounded but inconsistent win rate',
      (output: BacktestEngineOutput) => {
        output.metrics.winRatePct = 50;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'bounded but inconsistent drawdown',
      (output: BacktestEngineOutput) => {
        output.metrics.maxDrawdownPct = 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'inconsistent average win',
      (output: BacktestEngineOutput) => {
        output.metrics.avgWinPct = 0;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'inconsistent Sharpe',
      (output: BacktestEngineOutput) => {
        output.metrics.sharpeRatio = 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'positive average loss',
      (output: BacktestEngineOutput) => {
        output.metrics.avgLossPct = 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'average loss below -100%',
      (output: BacktestEngineOutput) => {
        output.metrics.avgLossPct = -101;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'invalid equity timestamp',
      (output: BacktestEngineOutput) => {
        output.equityCurve[0].ts = new Date(Number.NaN);
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'equity timestamp outside the run range',
      (output: BacktestEngineOutput) => {
        output.equityCurve[0].ts = new Date('2025-12-31T23:59:59.999Z');
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'invalid trade entry timestamp',
      (output: BacktestEngineOutput) => {
        output.trades[0].entryTime = new Date(Number.NaN);
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'trade exit outside the run range',
      (output: BacktestEngineOutput) => {
        output.trades[0].exitTime = new Date('2026-01-02T00:00:00.001Z');
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'invalid trade exit timestamp',
      (output: BacktestEngineOutput) => {
        output.trades[0].exitTime = new Date(Number.NaN);
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'trade exit before entry',
      (output: BacktestEngineOutput) => {
        output.trades[0].entryTime = new Date('2026-01-02T00:00:00.000Z');
        output.trades[0].exitTime = new Date('2026-01-01T00:00:00.000Z');
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'unsorted trades',
      (output: BacktestEngineOutput) => {
        output.trades[0].entryTime = new Date('2026-01-02T00:00:00.000Z');
        output.trades.push({
          ...output.trades[0],
          entryTime: new Date('2026-01-01T00:00:00.000Z'),
        });
        output.metrics.numTrades = 2;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'unsupported trade side',
      (output: BacktestEngineOutput) => {
        output.trades[0].side = 'short' as never;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'final equity mismatch',
      (output: BacktestEngineOutput) => {
        output.metrics.finalEquity += 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'initial equity mismatch',
      (output: BacktestEngineOutput) => {
        output.equityCurve[0].equity += 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'total return mismatch',
      (output: BacktestEngineOutput) => {
        output.metrics.totalReturnPct += 1;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
    [
      'sub-storage-step total return mismatch',
      (output: BacktestEngineOutput) => {
        output.metrics.totalReturnPct += 0.00001;
      },
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    ],
  ])('fails closed for %s output', async (_name, mutate, code) => {
    const { service } = createService();
    const run = await service.createRun(createInput());
    await service.markRunning(run.id, USER_ID);
    const output = engineOutput();
    mutate(output);

    await expect(
      service.completeRun(run.id, USER_ID, output),
    ).rejects.toMatchObject({ code });
    expect(await service.getRun(run.id, USER_ID)).toMatchObject({
      run: { status: 'running' },
      result: null,
    });
  });

  it('rejects a missing engine output without changing the running record', async () => {
    const { service } = createService();
    const run = await service.createRun(createInput());
    await service.markRunning(run.id, USER_ID);

    await expect(
      service.completeRun(
        run.id,
        USER_ID,
        null as unknown as BacktestEngineOutput,
      ),
    ).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_INVALID_DEFINITION,
    });
    await expect(service.getRun(run.id, USER_ID)).resolves.toMatchObject({
      run: { status: 'running' },
      result: null,
    });
  });

  it('persists computed numeric Sharpe and normalizes an absent trade symbol', async () => {
    const { service } = createService();
    const run = await service.createRun({
      ...createInput(),
      endDate: new Date('2026-01-03T00:00:00.000Z'),
    });
    await service.markRunning(run.id, USER_ID);
    const output = engineOutputWithSharpe();
    output.trades[0].symbolId = undefined;
    expect(output.metrics.sharpeRatio).not.toBeNull();

    await service.completeRun(run.id, USER_ID, output);
    await expect(service.getRun(run.id, USER_ID)).resolves.toMatchObject({
      result: { sharpeRatio: expect.stringMatching(/^-?\d+\.\d{4}$/) },
      trades: [{ symbolId: 1 }],
    });
  });

  it('recomputes stored summary metrics from fixed-scale persisted rows', async () => {
    const { service } = createService();
    const run = await service.createRun(createInput());
    await service.markRunning(run.id, USER_ID);
    const trade = {
      entryTime: new Date('2026-01-01T00:00:00.000Z'),
      exitTime: new Date('2026-01-02T00:00:00.000Z'),
      side: 'long' as const,
      entryPrice: 3,
      exitPrice: 3.1,
      quantity: 333.3333333333333,
      pnlAbs: 33.33333333333333,
      pnlPct: 3.333333333333333,
      symbolId: 1,
    };
    const equityCurve = [
      { ts: new Date('2026-01-01T00:00:00.000Z'), equity: 1_000 },
      {
        ts: new Date('2026-01-02T00:00:00.000Z'),
        equity: 1_033.3333333333333,
      },
    ];
    const output: BacktestEngineOutput = {
      trades: [trade],
      equityCurve,
      metrics: calculateMetrics(1_000, [trade], equityCurve),
      diagnostics: {
        barsProcessed: 2,
        durationMs: 0,
        indicatorsComputed: 0,
        signalsFired: 1,
      },
    };

    await service.completeRun(run.id, USER_ID, output);

    await expect(service.getRun(run.id, USER_ID)).resolves.toMatchObject({
      result: {
        finalEquity: '1033.33',
        totalReturnPct: '3.3330',
        avgWinPct: '3.3333',
      },
      trades: [
        {
          quantity: '333.33333333',
          pnlAbs: '33.33333333',
          pnlPct: '3.3333',
        },
      ],
      equityCurve: [{ equity: '1000.00' }, { equity: '1033.33' }],
    });
  });

  it('validates bounded list filters', async () => {
    const { service } = createService();

    await expect(service.listRuns(USER_ID, { limit: 0 })).rejects.toMatchObject(
      { code: ErrorCode.VALIDATION_ERROR },
    );
    await expect(
      service.listRuns(USER_ID, { offset: 10_001 }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.listRuns(USER_ID, { symbolId: -1 }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.listRuns(USER_ID, { status: 'cancelled' as never }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.listRuns(USER_ID, { strategyId: 'not-a-uuid' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.listRuns(USER_ID, {
        strategyId: STRATEGY_ID,
        symbolId: 1,
        status: 'pending',
        limit: 100,
        offset: 0,
      }),
    ).resolves.toEqual([]);
  });

  it('is exported by BacktestModule', async () => {
    const module = await Test.createTestingModule({
      imports: [BacktestModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ isEnabled: false })
      .overrideProvider(StrategiesService)
      .useValue({
        resolveOwnedVersion: jest.fn().mockResolvedValue({
          strategyId: STRATEGY_ID,
          strategyVersionId: 1,
          versionNumber: 1,
          assetType: 'EQUITY',
          timeframe: '1d',
          definition: definition(),
        }),
      })
      .compile();

    expect(module.get(BacktestsService)).toBeInstanceOf(BacktestsService);
    await module.close();
  });
});

function createService() {
  const repository = new BacktestsRepository({
    isEnabled: false,
  } as PrismaService);
  const resolve = jest.fn().mockResolvedValue({
    strategyId: STRATEGY_ID,
    strategyVersionId: 2,
    versionNumber: 2,
    assetType: 'EQUITY',
    timeframe: '1d',
    definition: definition(),
  });
  const pinning = {
    resolve,
  } as unknown as StrategyVersionPinningService;
  const ensureUserPersisted = jest.fn().mockResolvedValue(undefined);
  const requireActiveSymbolById = jest.fn().mockResolvedValue({
    id: 1,
    symbol: 'AAPL',
    asset_type: 'EQUITY',
    is_active: true,
  });
  const getJobForUser = jest.fn().mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000030',
    userId: USER_ID,
  });
  return {
    service: new BacktestsService(
      repository,
      pinning,
      {
        ensureUserPersisted,
      } as unknown as AuthService,
      {
        requireActiveSymbolById,
      } as unknown as MarketDataService,
      {
        getJobForUser,
      } as unknown as JobsService,
    ),
    resolve,
    ensureUserPersisted,
    requireActiveSymbolById,
    getJobForUser,
  };
}

function createInput(): CreateBacktestRunInput {
  return {
    userId: USER_ID,
    strategyId: STRATEGY_ID,
    symbolId: 1,
    timeframe: '1d',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-02T00:00:00.000Z'),
    initialEquity: 1_000,
  };
}

function engineOutput(): BacktestEngineOutput {
  return runBacktest(
    {
      definition: definition(),
      bars: bars(),
      initialEquity: 1_000,
      symbolId: 1,
    },
    { now: () => 0 },
  );
}

function engineOutputWithSharpe(): BacktestEngineOutput {
  return runBacktest(
    {
      definition: definition(),
      bars: [
        ...bars(),
        {
          ts: new Date('2026-01-03T00:00:00.000Z'),
          open: 110,
          high: 110,
          low: 90,
          close: 90,
          volume: 1_000,
        },
      ],
      initialEquity: 1_000,
      symbolId: 1,
    },
    { now: () => 0 },
  );
}

function definition(): StrategyDefinition {
  return {
    indicators: [],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'gt',
          right: { literal: 0 },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'lt',
          right: { literal: 0 },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 50 },
      take_profit: { type: 'percent', value: 500 },
    },
  };
}

function bars(): EngineBar[] {
  return [
    {
      ts: new Date('2026-01-01T00:00:00.000Z'),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1_000,
    },
    {
      ts: new Date('2026-01-02T00:00:00.000Z'),
      open: 100,
      high: 110,
      low: 100,
      close: 110,
      volume: 1_000,
    },
  ];
}
