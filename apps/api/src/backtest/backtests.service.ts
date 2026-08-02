import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { ERROR_CATALOG } from '../common/errors/error-catalog';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { JobsService } from '../jobs/jobs.service';
import { MarketDataService } from '../market-data/market-data.service';
import type { BacktestEngineOutput } from './engine/backtest-engine.types';
import type { EngineMetrics } from './engine/backtest-engine.types';
import { calculateMetrics } from './engine/metrics';
import {
  backtestInvalidStateError,
  backtestNotFoundError,
  backtestOutputError,
  backtestValidationError,
} from './backtest-errors';
import { toPersistedDecimal } from './backtest-decimals';
import { BacktestsRepository } from './backtests.repository';
import type {
  BacktestCompletionRecord,
  BacktestEquityPointRecord,
  BacktestRunDetail,
  BacktestRunDetailPage,
  BacktestRunListPage,
  BacktestRunRecord,
  BacktestRunSummary,
  BacktestTradeRecord,
  CreateBacktestRunInput,
  ListBacktestFilters,
  ResolvedListBacktestFilters,
} from './backtests.types';
import { BACKTEST_STATUSES } from './backtests.types';
import { StrategyVersionPinningService } from './strategy-version-pinning';

const MAX_ERROR_MESSAGE_LENGTH = 2_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class BacktestsService {
  constructor(
    private readonly repository: BacktestsRepository,
    private readonly pinning: StrategyVersionPinningService,
    private readonly auth: AuthService,
    private readonly marketData: MarketDataService,
    private readonly jobs: JobsService,
  ) {}

  async createRun(input: CreateBacktestRunInput): Promise<BacktestRunRecord> {
    assertCreateInput(input);
    await this.auth.ensureUserPersisted(input.userId);
    const pin = await this.pinning.resolve(
      input.userId,
      input.strategyId,
      input.strategyVersionId,
    );
    if (
      input.strategyVersionId === undefined &&
      pin.timeframe !== input.timeframe
    ) {
      throw backtestValidationError(
        'timeframe',
        `timeframe must match the pinned strategy timeframe ${pin.timeframe}.`,
      );
    }
    const symbol = await this.marketData.requireActiveSymbolById(
      input.symbolId,
    );
    if (pin.assetType !== symbol.asset_type) {
      throw backtestValidationError(
        'symbolId',
        `symbolId must reference an active ${pin.assetType} symbol.`,
      );
    }
    if (symbol.asset_type === 'EQUITY' && input.timeframe !== '1d') {
      throw backtestValidationError(
        'timeframe',
        'Equity backtests support only the 1d timeframe.',
      );
    }
    if (input.jobId !== undefined) {
      await this.jobs.getJobForUser(input.jobId, input.userId);
    }

    const now = new Date();
    return this.repository.createRun({
      id: crypto.randomUUID(),
      userId: input.userId,
      strategyId: pin.strategyId,
      strategyVersionId: pin.strategyVersionId,
      symbolId: input.symbolId,
      timeframe: input.timeframe,
      startDate: cloneDate(input.startDate),
      endDate: cloneDate(input.endDate),
      initialEquity: toPersistedDecimal(
        input.initialEquity,
        18,
        2,
        'initialEquity',
        { positive: true },
      ),
      status: 'pending',
      ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
      createdAt: now,
      updatedAt: now,
    });
  }

  async markRunning(
    runId: string,
    userId: string,
    jobId?: string,
  ): Promise<void> {
    assertIdentity('runId', runId);
    assertIdentity('userId', userId);
    if (jobId !== undefined) {
      assertIdentity('jobId', jobId);
    }
    await this.auth.ensureUserPersisted(userId);
    if (jobId !== undefined) {
      await this.jobs.getJobForUser(jobId, userId);
    }
    await this.repository.markRunning(runId, userId, new Date(), jobId);
  }

  async completeRun(
    runId: string,
    userId: string,
    output: BacktestEngineOutput,
  ): Promise<void> {
    assertIdentity('runId', runId);
    assertIdentity('userId', userId);
    await this.auth.ensureUserPersisted(userId);
    const run = await this.repository.findRunForUser(runId, userId);
    if (!run) {
      throw backtestNotFoundError(runId);
    }
    if (run.status !== 'running') {
      throw backtestInvalidStateError(runId, run.status, 'completed');
    }
    const completion = mapCompletion(run, output);
    await this.repository.completeRun(runId, userId, completion);
  }

  async failRun(
    runId: string,
    userId: string,
    error: { code: string; message: string },
  ): Promise<void> {
    assertIdentity('runId', runId);
    assertIdentity('userId', userId);
    await this.auth.ensureUserPersisted(userId);
    const status = error.code === 'BACKTEST_TIMEOUT' ? 'timed_out' : 'failed';
    await this.repository.failRun(runId, userId, {
      status,
      errorMessage: publicErrorMessage(error.code),
      finishedAt: new Date(),
    });
  }

  async getRun(
    runId: string,
    userId: string,
  ): Promise<BacktestRunDetail | null> {
    assertIdentity('runId', runId);
    assertIdentity('userId', userId);
    await this.auth.ensureUserPersisted(userId);
    return this.repository.findDetailForUser(runId, userId);
  }

  async listRuns(
    userId: string,
    filters: ListBacktestFilters = {},
  ): Promise<BacktestRunSummary[]> {
    assertIdentity('userId', userId);
    await this.auth.ensureUserPersisted(userId);
    return this.repository.listForUser(userId, resolveListFilters(filters));
  }

  async getRunPage(
    runId: string,
    userId: string,
    tradesLimit = 500,
    tradesOffset = 0,
  ): Promise<BacktestRunDetailPage | null> {
    assertIdentity('runId', runId);
    assertIdentity('userId', userId);
    if (
      !Number.isSafeInteger(tradesLimit) ||
      tradesLimit < 1 ||
      tradesLimit > 1000
    ) {
      throw backtestValidationError(
        'trades_limit',
        'trades_limit must be an integer between 1 and 1000.',
      );
    }
    if (
      !Number.isSafeInteger(tradesOffset) ||
      tradesOffset < 0 ||
      tradesOffset > 100_000
    ) {
      throw backtestValidationError(
        'trades_offset',
        'trades_offset must be an integer between 0 and 100000.',
      );
    }
    await this.auth.ensureUserPersisted(userId);
    return this.repository.findDetailPageForUser(
      runId,
      userId,
      tradesLimit,
      tradesOffset,
    );
  }

  async listRunPage(
    userId: string,
    filters: ListBacktestFilters = {},
  ): Promise<BacktestRunListPage> {
    assertIdentity('userId', userId);
    await this.auth.ensureUserPersisted(userId);
    return this.repository.listPageForUser(userId, resolveListFilters(filters));
  }

  async ensureTerminalFailure(
    runId: string,
    userId: string,
    error: { code: string; message: string },
  ): Promise<void> {
    const current = await this.repository.findRunForUser(runId, userId);
    if (
      !current ||
      ['completed', 'failed', 'timed_out'].includes(current.status)
    ) {
      return;
    }
    if (current.status === 'pending') {
      await this.markRunning(runId, userId, current.jobId);
    }
    await this.failRun(runId, userId, error);
  }

  async getTrades(
    runId: string,
    userId: string,
  ): Promise<BacktestTradeRecord[]> {
    const detail = await this.getRun(runId, userId);
    if (!detail) {
      throw backtestNotFoundError(runId);
    }
    return detail.trades;
  }

  async getEquityCurve(
    runId: string,
    userId: string,
  ): Promise<BacktestEquityPointRecord[]> {
    const detail = await this.getRun(runId, userId);
    if (!detail) {
      throw backtestNotFoundError(runId);
    }
    return detail.equityCurve;
  }
}

function assertCreateInput(input: CreateBacktestRunInput): void {
  if (!input || typeof input !== 'object') {
    throw backtestValidationError('body', 'Backtest input is required.');
  }
  assertIdentity('userId', input.userId);
  assertIdentity('strategyId', input.strategyId);
  if (input.jobId !== undefined) {
    assertIdentity('jobId', input.jobId);
  }
  if (
    input.strategyVersionId !== undefined &&
    (!Number.isSafeInteger(input.strategyVersionId) ||
      input.strategyVersionId <= 0)
  ) {
    throw backtestValidationError(
      'strategyVersionId',
      'strategyVersionId must be a positive integer.',
    );
  }
  if (!Number.isSafeInteger(input.symbolId) || input.symbolId <= 0) {
    throw backtestValidationError(
      'symbolId',
      'symbolId must be a positive integer.',
    );
  }
  if (!['1d', '1h'].includes(input.timeframe)) {
    throw backtestValidationError(
      'timeframe',
      'timeframe must be either 1d or 1h.',
    );
  }
  assertDate('startDate', input.startDate);
  assertDate('endDate', input.endDate);
  if (input.startDate.getTime() >= input.endDate.getTime()) {
    throw backtestValidationError(
      'endDate',
      'endDate must be after startDate.',
    );
  }
  if (
    typeof input.initialEquity !== 'number' ||
    !Number.isFinite(input.initialEquity) ||
    input.initialEquity <= 0
  ) {
    throw backtestValidationError(
      'initialEquity',
      'initialEquity must be a positive finite number.',
    );
  }
  if (new Prisma.Decimal(input.initialEquity).decimalPlaces() > 2) {
    throw backtestValidationError(
      'initialEquity',
      'initialEquity must have at most 2 decimal places.',
    );
  }
}

function assertIdentity(field: string, value: string): void {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw backtestValidationError(field, `${field} must be a UUID.`);
  }
}

function assertDate(field: string, value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw backtestValidationError(field, `${field} must be a valid Date.`);
  }
}

function resolveListFilters(
  filters: ListBacktestFilters,
): ResolvedListBacktestFilters {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw backtestValidationError(
      'limit',
      'limit must be an integer between 1 and 100.',
    );
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10_000) {
    throw backtestValidationError(
      'offset',
      'offset must be an integer between 0 and 10000.',
    );
  }
  if (
    filters.symbolId !== undefined &&
    (!Number.isSafeInteger(filters.symbolId) || filters.symbolId <= 0)
  ) {
    throw backtestValidationError(
      'symbolId',
      'symbolId must be a positive integer.',
    );
  }
  if (
    filters.status !== undefined &&
    !BACKTEST_STATUSES.includes(filters.status)
  ) {
    throw backtestValidationError('status', 'status is not supported.');
  }
  if (filters.strategyId !== undefined) {
    assertIdentity('strategyId', filters.strategyId);
  }
  return {
    ...(filters.strategyId === undefined
      ? {}
      : { strategyId: filters.strategyId }),
    ...(filters.symbolId === undefined ? {} : { symbolId: filters.symbolId }),
    ...(filters.status === undefined ? {} : { status: filters.status }),
    limit,
    offset,
  };
}

function mapCompletion(
  run: BacktestRunRecord,
  output: BacktestEngineOutput,
): BacktestCompletionRecord {
  if (!output || typeof output !== 'object') {
    throw backtestOutputError('Backtest output is required.');
  }
  if (!Array.isArray(output.trades) || !Array.isArray(output.equityCurve)) {
    throw backtestOutputError(
      'Backtest output requires trades and equityCurve arrays.',
    );
  }
  if (output.equityCurve.length === 0) {
    throw backtestOutputError(
      'A completed backtest requires at least one equity point.',
    );
  }
  if (
    !output.metrics ||
    !Number.isSafeInteger(output.metrics.numTrades) ||
    output.metrics.numTrades < 0 ||
    output.metrics.numTrades !== output.trades.length
  ) {
    throw backtestOutputError(
      'Backtest trade count does not match the persisted metrics.',
    );
  }
  if (
    output.metrics.maxDrawdownPct < 0 ||
    output.metrics.maxDrawdownPct > 100 ||
    output.metrics.winRatePct < 0 ||
    output.metrics.winRatePct > 100 ||
    output.metrics.avgLossPct > 0 ||
    output.metrics.avgLossPct < -100
  ) {
    throw backtestOutputError('Backtest metrics are outside valid bounds.');
  }

  let previousEquityTimestamp = Number.NEGATIVE_INFINITY;
  const equityCurve = output.equityCurve.map((point, index) => {
    assertOutputDate(`equityCurve[${index}].ts`, point?.ts);
    assertWithinRunRange(run, `equityCurve[${index}].ts`, point.ts);
    const timestamp = point.ts.getTime();
    if (timestamp <= previousEquityTimestamp) {
      throw backtestOutputError(
        'Backtest equity timestamps must be strictly ascending.',
      );
    }
    previousEquityTimestamp = timestamp;
    return {
      timestamp: cloneDate(point.ts),
      equity: toPersistedDecimal(
        point.equity,
        18,
        2,
        `equityCurve[${index}].equity`,
        { nonNegative: true },
      ),
    };
  });

  let previousEntryTimestamp = Number.NEGATIVE_INFINITY;
  const trades = output.trades.map((trade, index) => {
    assertOutputDate(`trades[${index}].entryTime`, trade?.entryTime);
    assertOutputDate(`trades[${index}].exitTime`, trade?.exitTime);
    assertWithinRunRange(run, `trades[${index}].entryTime`, trade.entryTime);
    assertWithinRunRange(run, `trades[${index}].exitTime`, trade.exitTime);
    if (trade.entryTime.getTime() > trade.exitTime.getTime()) {
      throw backtestOutputError(
        `Trade ${index} exits before its entry timestamp.`,
      );
    }
    if (trade.entryTime.getTime() < previousEntryTimestamp) {
      throw backtestOutputError(
        'Backtest trades must be ordered by entry timestamp.',
      );
    }
    previousEntryTimestamp = trade.entryTime.getTime();
    if (trade.side !== 'long') {
      throw backtestOutputError('Only long trades can be persisted.');
    }
    if (trade.symbolId !== undefined && trade.symbolId !== run.symbolId) {
      throw backtestOutputError(
        'Trade symbolId does not match its backtest run.',
      );
    }
    const entryPrice = toPersistedDecimal(
      trade.entryPrice,
      18,
      8,
      `trades[${index}].entryPrice`,
      { positive: true },
    );
    const exitPrice = toPersistedDecimal(
      trade.exitPrice,
      18,
      8,
      `trades[${index}].exitPrice`,
      { positive: true },
    );
    const quantity = toPersistedDecimal(
      trade.quantity,
      18,
      8,
      `trades[${index}].quantity`,
      { positive: true },
    );
    const reportedPnlAbs = toPersistedDecimal(
      trade.pnlAbs,
      18,
      8,
      `trades[${index}].pnlAbs`,
    );
    const reportedPnlPct = toPersistedDecimal(
      trade.pnlPct,
      9,
      4,
      `trades[${index}].pnlPct`,
    );
    const expectedPnlAbs = new Prisma.Decimal(exitPrice)
      .minus(entryPrice)
      .times(quantity)
      .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(8);
    const expectedPnlPct = new Prisma.Decimal(exitPrice)
      .div(entryPrice)
      .minus(1)
      .times(100)
      .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(4);
    const pnlAbsDifference = new Prisma.Decimal(reportedPnlAbs)
      .minus(expectedPnlAbs)
      .abs();
    const pnlPctDifference = new Prisma.Decimal(reportedPnlPct)
      .minus(expectedPnlPct)
      .abs();
    if (
      pnlAbsDifference.greaterThan('0.0000001') ||
      pnlPctDifference.greaterThan('0.0001')
    ) {
      throw backtestOutputError(
        `Trade ${index} P&L does not match its prices and quantity.`,
      );
    }

    return {
      symbolId: run.symbolId,
      entryTime: cloneDate(trade.entryTime),
      exitTime: cloneDate(trade.exitTime),
      side: 'long' as const,
      entryPrice,
      exitPrice,
      quantity,
      pnlAbs: expectedPnlAbs,
      pnlPct: expectedPnlPct,
    };
  });

  const rawMetrics = calculateMetrics(
    Number(run.initialEquity),
    output.trades,
    output.equityCurve,
  );
  assertRawMetricsMatch(output.metrics, rawMetrics);
  mapMetrics(output.metrics, 'metrics');

  const persistedMetrics = calculateMetrics(
    Number(run.initialEquity),
    trades.map((trade) => ({
      entryTime: trade.entryTime,
      exitTime: trade.exitTime,
      side: trade.side,
      entryPrice: Number(trade.entryPrice),
      exitPrice: Number(trade.exitPrice),
      quantity: Number(trade.quantity),
      pnlAbs: Number(trade.pnlAbs),
      pnlPct: Number(trade.pnlPct),
      symbolId: trade.symbolId,
    })),
    equityCurve.map((point) => ({
      ts: point.timestamp,
      equity: Number(point.equity),
    })),
  );
  const result = mapMetrics(persistedMetrics, 'persistedMetrics');
  if (result.finalEquity !== equityCurve.at(-1)?.equity) {
    throw backtestOutputError(
      'Final equity does not match the last equity-curve point.',
    );
  }
  if (run.initialEquity !== equityCurve[0].equity) {
    throw backtestOutputError(
      'Initial equity does not match the first equity-curve point.',
    );
  }
  const expectedTotalReturnPct = new Prisma.Decimal(result.finalEquity)
    .div(run.initialEquity)
    .minus(1)
    .times(100)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP)
    .toFixed(4);
  if (result.totalReturnPct !== expectedTotalReturnPct) {
    throw backtestOutputError(
      'Total return does not match the persisted initial and final equity.',
    );
  }

  return {
    result,
    trades,
    equityCurve,
    finishedAt: new Date(),
  };
}

function assertRawMetricsMatch(
  supplied: EngineMetrics,
  expected: EngineMetrics,
): void {
  if (
    supplied.finalEquity !== expected.finalEquity ||
    supplied.totalReturnPct !== expected.totalReturnPct ||
    supplied.maxDrawdownPct !== expected.maxDrawdownPct ||
    supplied.winRatePct !== expected.winRatePct ||
    supplied.numTrades !== expected.numTrades ||
    supplied.avgWinPct !== expected.avgWinPct ||
    supplied.avgLossPct !== expected.avgLossPct ||
    supplied.sharpeRatio !== expected.sharpeRatio
  ) {
    throw backtestOutputError(
      'Backtest summary metrics do not match the trades and equity curve.',
    );
  }
}

function mapMetrics(
  metrics: EngineMetrics,
  fieldPrefix: string,
): BacktestCompletionRecord['result'] {
  return {
    finalEquity: toPersistedDecimal(
      metrics.finalEquity,
      18,
      2,
      `${fieldPrefix}.finalEquity`,
      { nonNegative: true },
    ),
    totalReturnPct: toPersistedDecimal(
      metrics.totalReturnPct,
      9,
      4,
      `${fieldPrefix}.totalReturnPct`,
    ),
    maxDrawdownPct: toPersistedDecimal(
      metrics.maxDrawdownPct,
      9,
      4,
      `${fieldPrefix}.maxDrawdownPct`,
      { nonNegative: true },
    ),
    winRatePct: toPersistedDecimal(
      metrics.winRatePct,
      9,
      4,
      `${fieldPrefix}.winRatePct`,
      { nonNegative: true },
    ),
    numTrades: metrics.numTrades,
    avgWinPct: toPersistedDecimal(
      metrics.avgWinPct,
      9,
      4,
      `${fieldPrefix}.avgWinPct`,
      { nonNegative: true },
    ),
    avgLossPct: toPersistedDecimal(
      metrics.avgLossPct,
      9,
      4,
      `${fieldPrefix}.avgLossPct`,
    ),
    sharpeRatio:
      metrics.sharpeRatio === null
        ? null
        : toPersistedDecimal(
            metrics.sharpeRatio,
            9,
            4,
            `${fieldPrefix}.sharpeRatio`,
          ),
  };
}

function assertOutputDate(field: string, value: Date): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw backtestOutputError(`${field} must be a valid Date.`);
  }
}

function assertWithinRunRange(
  run: BacktestRunRecord,
  field: string,
  value: Date,
): void {
  const timestamp = value.getTime();
  if (
    timestamp < run.startDate.getTime() ||
    timestamp > run.endDate.getTime()
  ) {
    throw backtestOutputError(
      `${field} must be inside the backtest run date range.`,
    );
  }
}

function publicErrorMessage(code: string): string {
  const knownCode = (Object.values(ErrorCode) as string[]).includes(code)
    ? (code as ErrorCode)
    : ErrorCode.INTERNAL_ERROR;
  const message =
    ERROR_CATALOG[knownCode].defaultDetail ??
    ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail ??
    'Backtest execution failed.';
  return `[${knownCode}] ${message}`.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

function cloneDate(value: Date): Date {
  return new Date(value.getTime());
}
