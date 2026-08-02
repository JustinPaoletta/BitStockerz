import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { BacktestsHttpService } from './backtests-http.service';
import type {
  BacktestResultRecord,
  BacktestRunRecord,
} from './backtests.types';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const STRATEGY_ID = '33333333-3333-4333-8333-333333333333';
const JOB_ID = '44444444-4444-4444-8444-444444444444';

function run(
  status: BacktestRunRecord['status'] = 'completed',
): BacktestRunRecord {
  const createdAt = new Date('2026-01-01T00:00:00Z');
  return {
    id: RUN_ID,
    userId: USER_ID,
    strategyId: STRATEGY_ID,
    strategyVersionId: 7,
    symbolId: 1,
    timeframe: '1d',
    startDate: createdAt,
    endDate: new Date('2026-01-02T23:59:59.999Z'),
    initialEquity: '10000.00',
    status,
    jobId: JOB_ID,
    createdAt,
    updatedAt: createdAt,
    startedAt: createdAt,
    finishedAt: createdAt,
  };
}

const result: BacktestResultRecord = {
  finalEquity: '10100.00',
  totalReturnPct: '1.0000',
  maxDrawdownPct: '0.1000',
  winRatePct: '100.0000',
  numTrades: 1,
  avgWinPct: '1.0000',
  avgLossPct: '0.0000',
  sharpeRatio: null,
};

function setup() {
  const backtests = {
    createRun: jest.fn(async () => run('pending')),
    getRun: jest.fn(async () => ({
      run: run(),
      result,
      trades: [],
      equityCurve: [],
    })),
    ensureTerminalFailure: jest.fn(),
    listRunPage: jest.fn(async () => ({
      items: [{ run: run(), result }],
      limit: 50,
      offset: 0,
      hasMore: false,
    })),
    getRunPage: jest.fn(async () => ({
      run: run(),
      result,
      trades: [
        {
          id: 9,
          symbolId: 1,
          entryTime: new Date('2026-01-01T01:00:00Z'),
          exitTime: new Date('2026-01-01T02:00:00Z'),
          side: 'long',
          entryPrice: '1.00000000',
          exitPrice: '2.00000000',
          quantity: '1.00000000',
          pnlAbs: '1.00000000',
          pnlPct: '100.0000',
        },
      ],
      equityCurve: [
        { timestamp: new Date('2026-01-01T00:00:00Z'), equity: '10000.00' },
      ],
      tradesPage: { limit: 500, offset: 0, hasMore: false },
    })),
  };
  const jobs = {
    createJob: jest.fn(async () => ({
      id: JOB_ID,
      userId: USER_ID,
      jobType: 'backtest_run',
      payload: {},
      status: 'pending',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })),
  };
  const executor = {
    execute: jest.fn(async () => ({
      id: JOB_ID,
      status: 'completed',
      payload: {
        diagnostics: {
          bars_processed: 2,
          duration_ms: 1,
          indicators_computed: 1,
          signals_fired: 1,
        },
      },
      createdAt: new Date('2026-01-01T00:00:00Z'),
      startedAt: new Date('2026-01-01T00:00:00Z'),
      finishedAt: new Date('2026-01-01T00:00:00.010Z'),
    })),
  };
  const marketData = {
    lookupSymbol: jest.fn(async () => ({
      id: 1,
      symbol: 'AAPL',
      asset_type: 'EQUITY',
    })),
    getSymbolsByIds: jest.fn(async () => [{ id: 1, symbol: 'AAPL' }]),
  };
  const strategies = {
    getOwnedStrategyNames: jest.fn(
      async () => new Map([[STRATEGY_ID, 'Alpha']]),
    ),
  };
  const config = { backtest: { maxBars: 10_000 } };
  const audit = { record: jest.fn() };
  const metrics = { recordBacktest: jest.fn() };
  const service = new BacktestsHttpService(
    backtests as never,
    jobs as never,
    executor as never,
    marketData as never,
    strategies as never,
    config as never,
    audit as never,
    metrics as never,
  );
  return { service, backtests, jobs, executor, marketData, metrics };
}

const createDto = {
  strategy_id: STRATEGY_ID,
  symbol: 'AAPL',
  timeframe: '1d' as const,
  start_date: '2026-01-01',
  end_date: '2026-01-02',
};

describe('BacktestsHttpService', () => {
  it('creates a safe job, executes it, and serializes a completed summary', async () => {
    const { service, jobs, metrics } = setup();
    const response = await service.create(USER_ID, createDto, 'request-1');
    expect(response.run).toMatchObject({
      id: RUN_ID,
      symbol: 'AAPL',
      status: 'completed',
      diagnostics: { bars_processed: 2 },
    });
    expect(response.results).toMatchObject({
      final_equity: '10100.00',
      sharpe_ratio: null,
    });
    expect(jobs.createJob).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.not.objectContaining({
          bars: expect.anything(),
          definition: expect.anything(),
          trades: expect.anything(),
        }),
      }),
    );
    expect(metrics.recordBacktest).toHaveBeenCalledWith('completed', 10);
  });

  it('maps terminal job errors and persists a terminal run', async () => {
    const { service, executor, backtests, metrics } = setup();
    executor.execute.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'timed_out',
      payload: { error_code: ErrorCode.BACKTEST_TIMEOUT },
      errorMessage: 'deadline',
      createdAt: new Date(0),
      startedAt: new Date(0),
      finishedAt: new Date(5),
    });
    await expect(service.create(USER_ID, createDto)).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_TIMEOUT,
    });
    expect(backtests.ensureTerminalFailure).toHaveBeenCalled();
    expect(metrics.recordBacktest).toHaveBeenCalledWith('timed_out', 5);
  });

  it('terminally fails a created run when job infrastructure throws', async () => {
    const first = setup();
    first.jobs.createJob.mockRejectedValueOnce(new Error('database secret'));
    await expect(first.service.create(USER_ID, createDto)).rejects.toThrow(
      'database secret',
    );
    expect(first.backtests.ensureTerminalFailure).toHaveBeenCalledWith(
      RUN_ID,
      USER_ID,
      {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Backtest execution failed.',
      },
    );

    const second = setup();
    second.executor.execute.mockRejectedValueOnce(
      new DomainError(ErrorCode.BACKTEST_TIMEOUT),
    );
    await expect(
      second.service.create(USER_ID, createDto),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_TIMEOUT });
    expect(second.backtests.ensureTerminalFailure).toHaveBeenCalledWith(
      RUN_ID,
      USER_ID,
      {
        code: ErrorCode.BACKTEST_TIMEOUT,
        message: 'Backtest execution failed.',
      },
    );
  });

  it('uses safe internal defaults for an unclassified failed job', async () => {
    const { service, executor, metrics } = setup();
    executor.execute.mockResolvedValueOnce({
      id: JOB_ID,
      status: 'failed',
      payload: {},
      createdAt: new Date(0),
    });
    await expect(
      service.create(USER_ID, {
        ...createDto,
        strategy_version_id: 2,
        initial_equity: 5000,
        timeframe: '1h',
        start_date: '2026-01-01T00:00:00-05:00',
        end_date: '2026-01-01T02:00:00-05:00',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INTERNAL_ERROR });
    expect(metrics.recordBacktest).toHaveBeenCalledWith(
      'failed',
      expect.any(Number),
    );
  });

  it('rejects invalid and impossible ranges before creating a run', async () => {
    const { service, backtests } = setup();
    await expect(
      service.create(USER_ID, {
        ...createDto,
        start_date: '2026-01-02',
        end_date: '2026-01-01',
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      service.create(USER_ID, {
        ...createDto,
        start_date: '2026-13-40',
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      service.create(USER_ID, {
        ...createDto,
        start_date: '2026-01-01T00:00:00',
        end_date: '2026-01-02T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      service.create(USER_ID, {
        ...createDto,
        start_date: '2000-01-01',
        end_date: '2060-01-01',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED });
    expect(backtests.createRun).not.toHaveBeenCalled();
  });

  it('enriches lists and serializes paginated detail records', async () => {
    const { service } = setup();
    const list = await service.list(USER_ID, {
      symbol: 'AAPL',
      status: 'completed',
    });
    expect(list).toMatchObject({
      has_more: false,
      items: [
        {
          strategy_name: 'Alpha',
          symbol: 'AAPL',
          total_return_pct: '1.0000',
        },
      ],
    });
    const detail = await service.detail(USER_ID, RUN_ID, {});
    expect(detail).toMatchObject({
      run: { id: RUN_ID, symbol: 'AAPL' },
      trades: [{ id: 9, pnl_abs: '1.00000000' }],
      trades_page: { limit: 500, offset: 0, has_more: false },
      equity_curve: [{ equity: '10000.00' }],
    });
  });

  it('returns not found for a missing detail and supports empty pending lists', async () => {
    const { service, backtests, marketData } = setup();
    backtests.getRunPage.mockResolvedValueOnce(null);
    await expect(service.detail(USER_ID, RUN_ID, {})).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_NOT_FOUND,
    });
    backtests.listRunPage.mockResolvedValueOnce({
      items: [{ run: run('pending'), result: null }],
      limit: 1,
      offset: 2,
      hasMore: true,
    });
    marketData.getSymbolsByIds.mockResolvedValueOnce([]);
    const list = await service.list(USER_ID, { limit: 1, offset: 2 });
    expect(list).toMatchObject({
      limit: 1,
      offset: 2,
      has_more: true,
      items: [{ symbol: 'UNKNOWN', strategy_name: 'Alpha', status: 'pending' }],
    });
    expect(list.items[0]).not.toHaveProperty('total_return_pct');
  });
});
