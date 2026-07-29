import { Injectable } from '@nestjs/common';
import type {
  BacktestEquityPoint,
  BacktestResult,
  BacktestRun,
  BacktestTrade,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  backtestInvalidStateError,
  backtestNotFoundError,
} from './backtest-errors';
import type {
  BacktestAggregateRecord,
  BacktestCompletionRecord,
  BacktestFailureRecord,
  BacktestRunDetail,
  BacktestRunRecord,
  BacktestRunSummary,
  BacktestStatus,
  BacktestTimeframe,
  ResolvedListBacktestFilters,
} from './backtests.types';

const INSERT_BATCH_SIZE = 500;

type PrismaBacktestRunWithResult = BacktestRun & {
  result: BacktestResult | null;
};

type PrismaBacktestRunDetail = PrismaBacktestRunWithResult & {
  trades: BacktestTrade[];
  equityPoints: BacktestEquityPoint[];
};

@Injectable()
export class BacktestsRepository {
  private readonly inMemoryRuns = new Map<string, BacktestAggregateRecord>();

  constructor(private readonly prisma: PrismaService) {}

  async createRun(record: BacktestRunRecord): Promise<BacktestRunRecord> {
    if (this.prisma.isEnabled) {
      const created = await this.prisma.backtestRun.create({
        data: {
          id: record.id,
          userId: record.userId,
          strategyId: record.strategyId,
          strategyVersionId: record.strategyVersionId,
          symbolId: record.symbolId,
          timeframe: record.timeframe,
          startDate: record.startDate,
          endDate: record.endDate,
          initialEquity: record.initialEquity,
          status: record.status,
          jobId: record.jobId ?? null,
          errorMessage: null,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          startedAt: null,
          finishedAt: null,
        },
      });
      return fromPrismaRun(created);
    }

    this.inMemoryRuns.set(record.id, {
      run: clone(record),
      result: null,
      trades: [],
      equityCurve: [],
    });
    return clone(record);
  }

  async findRunForUser(
    runId: string,
    userId: string,
  ): Promise<BacktestRunRecord | null> {
    if (this.prisma.isEnabled) {
      const record = await this.prisma.backtestRun.findFirst({
        where: { id: runId, userId },
      });
      return record ? fromPrismaRun(record) : null;
    }

    const aggregate = this.inMemoryRuns.get(runId);
    return aggregate?.run.userId === userId ? clone(aggregate.run) : null;
  }

  async findDetailForUser(
    runId: string,
    userId: string,
  ): Promise<BacktestRunDetail | null> {
    if (this.prisma.isEnabled) {
      const record = await this.prisma.backtestRun.findFirst({
        where: { id: runId, userId },
        include: {
          result: true,
          trades: { orderBy: [{ entryTime: 'asc' }, { id: 'asc' }] },
          equityPoints: {
            orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
          },
        },
      });
      return record ? fromPrismaDetail(record) : null;
    }

    const aggregate = this.inMemoryRuns.get(runId);
    return aggregate?.run.userId === userId ? toDetail(aggregate) : null;
  }

  async listForUser(
    userId: string,
    filters: ResolvedListBacktestFilters,
  ): Promise<BacktestRunSummary[]> {
    if (this.prisma.isEnabled) {
      const records = await this.prisma.backtestRun.findMany({
        where: {
          userId,
          ...(filters.strategyId === undefined
            ? {}
            : { strategyId: filters.strategyId }),
          ...(filters.symbolId === undefined
            ? {}
            : { symbolId: filters.symbolId }),
          ...(filters.status === undefined ? {} : { status: filters.status }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filters.offset,
        take: filters.limit,
        include: { result: true },
      });
      return records.map(fromPrismaSummary);
    }

    return [...this.inMemoryRuns.values()]
      .filter(
        ({ run }) =>
          run.userId === userId &&
          (filters.strategyId === undefined ||
            run.strategyId === filters.strategyId) &&
          (filters.symbolId === undefined ||
            run.symbolId === filters.symbolId) &&
          (filters.status === undefined || run.status === filters.status),
      )
      .sort(
        (left, right) =>
          right.run.createdAt.getTime() - left.run.createdAt.getTime() ||
          left.run.id.localeCompare(right.run.id),
      )
      .slice(filters.offset, filters.offset + filters.limit)
      .map(({ run, result }) => ({
        run: clone(run),
        result: result ? clone(result) : null,
      }));
  }

  async markRunning(
    runId: string,
    userId: string,
    startedAt: Date,
    jobId?: string,
  ): Promise<void> {
    if (this.prisma.isEnabled) {
      const current = await this.prisma.backtestRun.findFirst({
        where: { id: runId, userId },
        select: { status: true },
      });
      assertOwnedState(runId, current?.status, 'pending', 'running');
      const updated = await this.prisma.backtestRun.updateMany({
        where: { id: runId, userId, status: 'pending' },
        data: {
          status: 'running',
          startedAt,
          updatedAt: startedAt,
          ...(jobId === undefined ? {} : { jobId }),
        },
      });
      if (updated.count !== 1) {
        throw backtestInvalidStateError(runId, 'pending', 'running');
      }
      return;
    }

    const aggregate = requireOwnedAggregate(this.inMemoryRuns, runId, userId);
    if (aggregate.run.status !== 'pending') {
      throw backtestInvalidStateError(runId, aggregate.run.status, 'running');
    }
    const next = clone(aggregate);
    next.run.status = 'running';
    next.run.startedAt = clone(startedAt);
    next.run.updatedAt = clone(startedAt);
    if (jobId !== undefined) {
      next.run.jobId = jobId;
    }
    this.inMemoryRuns.set(runId, next);
  }

  async completeRun(
    runId: string,
    userId: string,
    completion: BacktestCompletionRecord,
  ): Promise<void> {
    if (this.prisma.isEnabled) {
      await this.completeWithPrisma(runId, userId, completion);
      return;
    }

    const aggregate = requireOwnedAggregate(this.inMemoryRuns, runId, userId);
    if (aggregate.run.status !== 'running') {
      throw backtestInvalidStateError(runId, aggregate.run.status, 'completed');
    }

    // Copy-on-write: the original aggregate remains untouched until every
    // dependent row has been cloned successfully.
    const next: BacktestAggregateRecord = {
      run: {
        ...clone(aggregate.run),
        status: 'completed',
        updatedAt: clone(completion.finishedAt),
        finishedAt: clone(completion.finishedAt),
      },
      result: clone(completion.result),
      trades: clone(completion.trades),
      equityCurve: clone(completion.equityCurve),
    };
    this.inMemoryRuns.set(runId, next);
  }

  async failRun(
    runId: string,
    userId: string,
    failure: BacktestFailureRecord,
  ): Promise<void> {
    if (this.prisma.isEnabled) {
      const current = await this.prisma.backtestRun.findFirst({
        where: { id: runId, userId },
        select: { status: true },
      });
      assertOwnedState(runId, current?.status, 'running', failure.status);
      const updated = await this.prisma.backtestRun.updateMany({
        where: { id: runId, userId, status: 'running' },
        data: {
          status: failure.status,
          errorMessage: failure.errorMessage,
          updatedAt: failure.finishedAt,
          finishedAt: failure.finishedAt,
        },
      });
      if (updated.count !== 1) {
        throw backtestInvalidStateError(runId, 'running', failure.status);
      }
      return;
    }

    const aggregate = requireOwnedAggregate(this.inMemoryRuns, runId, userId);
    if (aggregate.run.status !== 'running') {
      throw backtestInvalidStateError(
        runId,
        aggregate.run.status,
        failure.status,
      );
    }
    const next = clone(aggregate);
    next.run.status = failure.status;
    next.run.errorMessage = failure.errorMessage;
    next.run.updatedAt = clone(failure.finishedAt);
    next.run.finishedAt = clone(failure.finishedAt);
    this.inMemoryRuns.set(runId, next);
  }

  private async completeWithPrisma(
    runId: string,
    userId: string,
    completion: BacktestCompletionRecord,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const current = await transaction.backtestRun.findFirst({
        where: { id: runId, userId },
        select: { status: true },
      });
      assertOwnedState(runId, current?.status, 'running', 'completed');

      const updated = await transaction.backtestRun.updateMany({
        where: { id: runId, userId, status: 'running' },
        data: {
          status: 'completed',
          errorMessage: null,
          updatedAt: completion.finishedAt,
          finishedAt: completion.finishedAt,
        },
      });
      if (updated.count !== 1) {
        throw backtestInvalidStateError(runId, 'running', 'completed');
      }

      await transaction.backtestResult.create({
        data: {
          backtestRunId: runId,
          finalEquity: completion.result.finalEquity,
          totalReturnPct: completion.result.totalReturnPct,
          maxDrawdownPct: completion.result.maxDrawdownPct,
          winRatePct: completion.result.winRatePct,
          numTrades: completion.result.numTrades,
          avgWinPct: completion.result.avgWinPct,
          avgLossPct: completion.result.avgLossPct,
          sharpeRatio: completion.result.sharpeRatio,
        },
      });
      await this.saveTrades(transaction, runId, completion);
      await this.saveEquityCurve(transaction, runId, completion);
    });
  }

  private async saveTrades(
    transaction: Prisma.TransactionClient,
    runId: string,
    completion: BacktestCompletionRecord,
  ): Promise<void> {
    for (
      let offset = 0;
      offset < completion.trades.length;
      offset += INSERT_BATCH_SIZE
    ) {
      const batch = completion.trades
        .slice(offset, offset + INSERT_BATCH_SIZE)
        .map((trade): Prisma.BacktestTradeCreateManyInput => ({
          backtestRunId: runId,
          symbolId: trade.symbolId,
          entryTime: trade.entryTime,
          exitTime: trade.exitTime,
          side: trade.side,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          quantity: trade.quantity,
          pnlAbs: trade.pnlAbs,
          pnlPct: trade.pnlPct,
        }));
      await transaction.backtestTrade.createMany({ data: batch });
    }
  }

  private async saveEquityCurve(
    transaction: Prisma.TransactionClient,
    runId: string,
    completion: BacktestCompletionRecord,
  ): Promise<void> {
    for (
      let offset = 0;
      offset < completion.equityCurve.length;
      offset += INSERT_BATCH_SIZE
    ) {
      const batch = completion.equityCurve
        .slice(offset, offset + INSERT_BATCH_SIZE)
        .map((point): Prisma.BacktestEquityPointCreateManyInput => ({
          backtestRunId: runId,
          timestamp: point.timestamp,
          equity: point.equity,
        }));
      await transaction.backtestEquityPoint.createMany({ data: batch });
    }
  }
}

function assertOwnedState(
  runId: string,
  current: string | undefined,
  expected: BacktestStatus,
  requested: BacktestStatus,
): void {
  if (current === undefined) {
    throw backtestNotFoundError(runId);
  }
  if (current !== expected) {
    throw backtestInvalidStateError(
      runId,
      current as BacktestStatus,
      requested,
    );
  }
}

function requireOwnedAggregate(
  runs: Map<string, BacktestAggregateRecord>,
  runId: string,
  userId: string,
): BacktestAggregateRecord {
  const aggregate = runs.get(runId);
  if (!aggregate || aggregate.run.userId !== userId) {
    throw backtestNotFoundError(runId);
  }
  return aggregate;
}

function fromPrismaRun(record: BacktestRun): BacktestRunRecord {
  return {
    id: record.id,
    userId: record.userId,
    strategyId: record.strategyId,
    strategyVersionId: record.strategyVersionId,
    symbolId: record.symbolId,
    timeframe: record.timeframe as BacktestTimeframe,
    startDate: record.startDate,
    endDate: record.endDate,
    initialEquity: record.initialEquity.toFixed(2),
    status: record.status as BacktestStatus,
    ...(record.jobId === null ? {} : { jobId: record.jobId }),
    ...(record.errorMessage === null
      ? {}
      : { errorMessage: record.errorMessage }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.startedAt === null ? {} : { startedAt: record.startedAt }),
    ...(record.finishedAt === null ? {} : { finishedAt: record.finishedAt }),
  };
}

function fromPrismaResult(
  record: BacktestResult,
): BacktestRunSummary['result'] {
  return {
    finalEquity: record.finalEquity.toFixed(2),
    totalReturnPct: record.totalReturnPct.toFixed(4),
    maxDrawdownPct: record.maxDrawdownPct.toFixed(4),
    winRatePct: record.winRatePct.toFixed(4),
    numTrades: record.numTrades,
    avgWinPct: record.avgWinPct.toFixed(4),
    avgLossPct: record.avgLossPct.toFixed(4),
    sharpeRatio: record.sharpeRatio?.toFixed(4) ?? null,
  };
}

function fromPrismaSummary(
  record: PrismaBacktestRunWithResult,
): BacktestRunSummary {
  return {
    run: fromPrismaRun(record),
    result: record.result ? fromPrismaResult(record.result) : null,
  };
}

function fromPrismaDetail(record: PrismaBacktestRunDetail): BacktestRunDetail {
  return {
    ...fromPrismaSummary(record),
    trades: record.trades.map((trade) => ({
      symbolId: trade.symbolId,
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      side: trade.side as 'long',
      entryPrice: trade.entryPrice.toFixed(8),
      exitPrice: trade.exitPrice.toFixed(8),
      quantity: trade.quantity.toFixed(8),
      pnlAbs: trade.pnlAbs.toFixed(8),
      pnlPct: trade.pnlPct.toFixed(4),
    })),
    equityCurve: record.equityPoints.map((point) => ({
      timestamp: point.timestamp,
      equity: point.equity.toFixed(2),
    })),
  };
}

function toDetail(aggregate: BacktestAggregateRecord): BacktestRunDetail {
  return {
    run: clone(aggregate.run),
    result: aggregate.result ? clone(aggregate.result) : null,
    trades: clone(aggregate.trades),
    equityCurve: clone(aggregate.equityCurve),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
