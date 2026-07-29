import { Prisma } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { PrismaService } from '../prisma/prisma.service';
import { BacktestsRepository } from './backtests.repository';
import type {
  BacktestCompletionRecord,
  BacktestRunRecord,
} from './backtests.types';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000020';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000010';
const CREATED_AT = new Date('2026-07-28T20:00:00.000Z');

describe('BacktestsRepository', () => {
  it('provides owner-scoped copy-on-write persistence in memory', async () => {
    const repository = memoryRepository();
    const run = await repository.createRun(runRecord());

    run.status = 'failed';
    expect(await repository.findRunForUser(RUN_ID, USER_ID)).toMatchObject({
      status: 'pending',
    });
    await expect(
      repository.findRunForUser(RUN_ID, OTHER_USER_ID),
    ).resolves.toBeNull();

    await repository.markRunning(
      RUN_ID,
      USER_ID,
      new Date('2026-07-28T20:01:00.000Z'),
    );
    const completion = completionRecord();
    await repository.completeRun(RUN_ID, USER_ID, completion);

    const detail = await repository.findDetailForUser(RUN_ID, USER_ID);
    expect(detail).toMatchObject({
      run: {
        status: 'completed',
        strategyVersionId: 2,
        initialEquity: '1000.00',
      },
      result: {
        finalEquity: '1100.00',
        numTrades: 1,
      },
    });
    expect(detail?.trades).toHaveLength(1);
    expect(detail?.equityCurve).toHaveLength(2);

    if (detail?.result) {
      detail.result.finalEquity = '1.00';
    }
    expect(
      (await repository.findDetailForUser(RUN_ID, USER_ID))?.result,
    ).toMatchObject({ finalEquity: '1100.00' });
  });

  it('enforces owner-scoped immutable state transitions in memory', async () => {
    const repository = memoryRepository();
    await repository.createRun(runRecord());

    await expect(
      repository.completeRun(RUN_ID, USER_ID, completionRecord()),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
    await expect(
      repository.markRunning(RUN_ID, OTHER_USER_ID, CREATED_AT),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });

    const jobId = '00000000-0000-4000-8000-000000000030';
    await repository.markRunning(RUN_ID, USER_ID, CREATED_AT, jobId);
    await expect(
      repository.findRunForUser(RUN_ID, USER_ID),
    ).resolves.toMatchObject({ jobId });
    await expect(
      repository.markRunning(RUN_ID, USER_ID, CREATED_AT),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
    await repository.failRun(RUN_ID, USER_ID, {
      status: 'timed_out',
      errorMessage: '[BACKTEST_TIMEOUT] Timed out.',
      finishedAt: CREATED_AT,
    });
    await expect(
      repository.failRun(RUN_ID, USER_ID, {
        status: 'failed',
        errorMessage: 'again',
        finishedAt: CREATED_AT,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
    expect(await repository.findDetailForUser(RUN_ID, USER_ID)).toMatchObject({
      run: {
        status: 'timed_out',
        errorMessage: '[BACKTEST_TIMEOUT] Timed out.',
      },
      result: null,
      trades: [],
      equityCurve: [],
    });
  });

  it('filters and stably pages in-memory summaries', async () => {
    const repository = memoryRepository();
    await repository.createRun(runRecord());
    await repository.createRun({
      ...runRecord('00000000-0000-4000-8000-000000000021'),
      symbolId: 2,
      createdAt: new Date(CREATED_AT.getTime() + 1_000),
      updatedAt: new Date(CREATED_AT.getTime() + 1_000),
    });
    await repository.createRun({
      ...runRecord('00000000-0000-4000-8000-000000000022'),
      userId: OTHER_USER_ID,
      createdAt: new Date(CREATED_AT.getTime() + 2_000),
      updatedAt: new Date(CREATED_AT.getTime() + 2_000),
    });

    await expect(
      repository.listForUser(USER_ID, {
        symbolId: 2,
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject([
      { run: { id: '00000000-0000-4000-8000-000000000021' } },
    ]);
    await expect(
      repository.listForUser(USER_ID, { limit: 1, offset: 1 }),
    ).resolves.toMatchObject([{ run: { id: RUN_ID } }]);
  });

  it('creates, finds, and lists owner-scoped records with Prisma', async () => {
    const createdRecord = {
      ...prismaDetail(),
      jobId: '00000000-0000-4000-8000-000000000030',
      errorMessage: 'safe message',
      startedAt: CREATED_AT,
    };
    const create = jest.fn().mockResolvedValue(createdRecord);
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(createdRecord)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const findMany = jest.fn().mockResolvedValue([
      {
        ...createdRecord,
        result: {
          ...createdRecord.result,
          sharpeRatio: new Prisma.Decimal('1.25'),
        },
      },
    ]);
    const repository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: { create, findFirst, findMany },
    } as unknown as PrismaService);

    await expect(
      repository.createRun({
        ...runRecord(),
        jobId: '00000000-0000-4000-8000-000000000030',
      }),
    ).resolves.toMatchObject({
      id: RUN_ID,
      jobId: '00000000-0000-4000-8000-000000000030',
      errorMessage: 'safe message',
      startedAt: CREATED_AT,
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: RUN_ID,
        initialEquity: '1000.00',
        jobId: '00000000-0000-4000-8000-000000000030',
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      }),
    });

    await expect(
      repository.findRunForUser(RUN_ID, USER_ID),
    ).resolves.toMatchObject({ id: RUN_ID, initialEquity: '1000.00' });
    await expect(
      repository.findRunForUser(RUN_ID, OTHER_USER_ID),
    ).resolves.toBeNull();
    await expect(
      repository.findDetailForUser(RUN_ID, OTHER_USER_ID),
    ).resolves.toBeNull();

    await expect(
      repository.listForUser(USER_ID, {
        strategyId: STRATEGY_ID,
        symbolId: 1,
        status: 'completed',
        limit: 25,
        offset: 5,
      }),
    ).resolves.toMatchObject([
      {
        run: { id: RUN_ID },
        result: { sharpeRatio: '1.2500' },
      },
    ]);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        strategyId: STRATEGY_ID,
        symbolId: 1,
        status: 'completed',
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 5,
      take: 25,
      include: { result: true },
    });

    await repository.listForUser(USER_ID, {
      limit: 50,
      offset: 0,
    });
    expect(findMany).toHaveBeenLastCalledWith({
      where: { userId: USER_ID },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 50,
      include: { result: true },
    });
  });

  it('performs successful Prisma compare-and-set transitions', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ status: 'pending' })
      .mockResolvedValueOnce({ status: 'running' });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: { findFirst, updateMany },
    } as unknown as PrismaService);
    const jobId = '00000000-0000-4000-8000-000000000030';

    await repository.markRunning(RUN_ID, USER_ID, CREATED_AT, jobId);
    await repository.failRun(RUN_ID, USER_ID, {
      status: 'failed',
      errorMessage: '[INTERNAL_ERROR] Failed.',
      finishedAt: CREATED_AT,
    });

    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: RUN_ID, userId: USER_ID, status: 'pending' },
      data: {
        status: 'running',
        startedAt: CREATED_AT,
        updatedAt: CREATED_AT,
        jobId,
      },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: RUN_ID, userId: USER_ID, status: 'running' },
      data: {
        status: 'failed',
        errorMessage: '[INTERNAL_ERROR] Failed.',
        updatedAt: CREATED_AT,
        finishedAt: CREATED_AT,
      },
    });
  });

  it('rejects Prisma compare-and-set races without writing dependents', async () => {
    const markRepository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: {
        findFirst: jest.fn().mockResolvedValue({ status: 'pending' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService);
    await expect(
      markRepository.markRunning(RUN_ID, USER_ID, CREATED_AT),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });

    const failRepository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: {
        findFirst: jest.fn().mockResolvedValue({ status: 'running' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as unknown as PrismaService);
    await expect(
      failRepository.failRun(RUN_ID, USER_ID, {
        status: 'timed_out',
        errorMessage: 'timed out',
        finishedAt: CREATED_AT,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });

    const transaction = transactionMock();
    transaction.backtestRun.updateMany.mockResolvedValue({ count: 0 });
    const completeRepository = new BacktestsRepository({
      isEnabled: true,
      $transaction: jest.fn(async (fn) => fn(transaction)),
    } as unknown as PrismaService);
    await expect(
      completeRepository.completeRun(RUN_ID, USER_ID, completionRecord()),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
    expect(transaction.backtestResult.create).not.toHaveBeenCalled();
    expect(transaction.backtestTrade.createMany).not.toHaveBeenCalled();
  });

  it('uses one Prisma transaction and batches large equity curves', async () => {
    const transaction = transactionMock();
    const $transaction = jest.fn(async (fn) => fn(transaction));
    const repository = new BacktestsRepository({
      isEnabled: true,
      $transaction,
    } as unknown as PrismaService);
    const completion = completionRecord();
    completion.trades = Array.from({ length: 1_001 }, () => ({
      ...completion.trades[0],
    }));
    completion.equityCurve = Array.from({ length: 1_001 }, (_, index) => ({
      timestamp: new Date(CREATED_AT.getTime() + index * 60_000),
      equity: '1000.00',
    }));

    await repository.completeRun(RUN_ID, USER_ID, completion);

    expect($transaction).toHaveBeenCalledTimes(1);
    expect(transaction.backtestResult.create).toHaveBeenCalledTimes(1);
    expect(transaction.backtestTrade.createMany).toHaveBeenCalledTimes(3);
    expect(transaction.backtestEquityPoint.createMany).toHaveBeenCalledTimes(3);
  });

  it('propagates a mid-transaction insert failure before later rows run', async () => {
    const transaction = transactionMock();
    transaction.backtestTrade.createMany.mockRejectedValue(
      new Error('trade insert failed'),
    );
    const repository = new BacktestsRepository({
      isEnabled: true,
      $transaction: jest.fn(async (fn) => fn(transaction)),
    } as unknown as PrismaService);

    await expect(
      repository.completeRun(RUN_ID, USER_ID, completionRecord()),
    ).rejects.toThrow('trade insert failed');
    expect(transaction.backtestResult.create).toHaveBeenCalled();
    expect(transaction.backtestEquityPoint.createMany).not.toHaveBeenCalled();
  });

  it('maps Prisma detail decimals and requests deterministic ordering', async () => {
    const findFirst = jest.fn().mockResolvedValue(prismaDetail());
    const repository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: { findFirst },
    } as unknown as PrismaService);

    await expect(
      repository.findDetailForUser(RUN_ID, USER_ID),
    ).resolves.toMatchObject({
      run: { initialEquity: '1000.00', status: 'completed' },
      result: {
        finalEquity: '1100.00',
        totalReturnPct: '10.0000',
      },
      trades: [
        {
          entryPrice: '100.00000000',
          pnlPct: '10.0000',
        },
      ],
      equityCurve: [{ equity: '1000.00' }, { equity: '1100.00' }],
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: RUN_ID, userId: USER_ID },
      include: {
        result: true,
        trades: { orderBy: [{ entryTime: 'asc' }, { id: 'asc' }] },
        equityPoints: {
          orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
        },
      },
    });
  });

  it('maps missing and invalid Prisma transition states to domain errors', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ status: 'completed' });
    const repository = new BacktestsRepository({
      isEnabled: true,
      backtestRun: {
        findFirst,
        updateMany: jest.fn(),
      },
    } as unknown as PrismaService);

    await expect(
      repository.markRunning(RUN_ID, USER_ID, CREATED_AT),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_NOT_FOUND });
    await expect(
      repository.failRun(RUN_ID, USER_ID, {
        status: 'failed',
        errorMessage: 'failed',
        finishedAt: CREATED_AT,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.BACKTEST_INVALID_STATE });
  });
});

function memoryRepository(): BacktestsRepository {
  return new BacktestsRepository({
    isEnabled: false,
  } as PrismaService);
}

function runRecord(id = RUN_ID): BacktestRunRecord {
  return {
    id,
    userId: USER_ID,
    strategyId: STRATEGY_ID,
    strategyVersionId: 2,
    symbolId: 1,
    timeframe: '1d',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-02T00:00:00.000Z'),
    initialEquity: '1000.00',
    status: 'pending',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function completionRecord(): BacktestCompletionRecord {
  return {
    result: {
      finalEquity: '1100.00',
      totalReturnPct: '10.0000',
      maxDrawdownPct: '0.0000',
      winRatePct: '100.0000',
      numTrades: 1,
      avgWinPct: '10.0000',
      avgLossPct: '0.0000',
      sharpeRatio: null,
    },
    trades: [
      {
        symbolId: 1,
        entryTime: new Date('2026-01-01T00:00:00.000Z'),
        exitTime: new Date('2026-01-02T00:00:00.000Z'),
        side: 'long',
        entryPrice: '100.00000000',
        exitPrice: '110.00000000',
        quantity: '10.00000000',
        pnlAbs: '100.00000000',
        pnlPct: '10.0000',
      },
    ],
    equityCurve: [
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        equity: '1000.00',
      },
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        equity: '1100.00',
      },
    ],
    finishedAt: new Date('2026-07-28T20:02:00.000Z'),
  };
}

function transactionMock() {
  return {
    backtestRun: {
      findFirst: jest.fn().mockResolvedValue({ status: 'running' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    backtestResult: {
      create: jest.fn().mockResolvedValue({}),
    },
    backtestTrade: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    backtestEquityPoint: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function prismaDetail() {
  const completion = completionRecord();
  return {
    id: RUN_ID,
    userId: USER_ID,
    strategyId: STRATEGY_ID,
    strategyVersionId: 2,
    symbolId: 1,
    timeframe: '1d',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-02T00:00:00.000Z'),
    initialEquity: new Prisma.Decimal('1000'),
    status: 'completed',
    jobId: null,
    errorMessage: null,
    createdAt: CREATED_AT,
    updatedAt: completion.finishedAt,
    startedAt: CREATED_AT,
    finishedAt: completion.finishedAt,
    result: {
      id: 1,
      backtestRunId: RUN_ID,
      finalEquity: new Prisma.Decimal('1100'),
      totalReturnPct: new Prisma.Decimal('10'),
      maxDrawdownPct: new Prisma.Decimal('0'),
      winRatePct: new Prisma.Decimal('100'),
      numTrades: 1,
      avgWinPct: new Prisma.Decimal('10'),
      avgLossPct: new Prisma.Decimal('0'),
      sharpeRatio: null,
    },
    trades: [
      {
        id: 1,
        backtestRunId: RUN_ID,
        symbolId: 1,
        entryTime: completion.trades[0].entryTime,
        exitTime: completion.trades[0].exitTime,
        side: 'long',
        entryPrice: new Prisma.Decimal('100'),
        exitPrice: new Prisma.Decimal('110'),
        quantity: new Prisma.Decimal('10'),
        pnlAbs: new Prisma.Decimal('100'),
        pnlPct: new Prisma.Decimal('10'),
      },
    ],
    equityPoints: completion.equityCurve.map((point, index) => ({
      id: index + 1,
      backtestRunId: RUN_ID,
      timestamp: point.timestamp,
      equity: new Prisma.Decimal(point.equity),
    })),
  };
}
