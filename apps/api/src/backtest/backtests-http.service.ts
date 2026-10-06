import { csv } from '../common/csv';
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { JobExecutorService } from '../jobs/job-executor.service';
import { JobsService } from '../jobs/jobs.service';
import type { JobRecord } from '../jobs/jobs.types';
import { MarketDataService } from '../market-data/market-data.service';
import { AuditService } from '../observability/audit.service';
import { MetricsService } from '../observability/metrics.service';
import { StrategiesService } from '../strategies/strategies.service';
import {
  backtestNotFoundError,
  backtestValidationError,
} from './backtest-errors';
import { BacktestsService } from './backtests.service';
import type {
  BacktestResultRecord,
  BacktestRunDetailPage,
  BacktestRunRecord,
  BacktestRunSummary,
  BacktestTradeRecord,
} from './backtests.types';
import type { CreateBacktestDto } from './dto/create-backtest.dto';
import type {
  BacktestDetailQueryDto,
  ListBacktestsQueryDto,
} from './dto/list-backtests-query.dto';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

@Injectable()
export class BacktestsHttpService {
  private readonly logger = new Logger(BacktestsHttpService.name);

  constructor(
    private readonly backtests: BacktestsService,
    private readonly jobs: JobsService,
    private readonly executor: JobExecutorService,
    private readonly marketData: MarketDataService,
    private readonly strategies: StrategiesService,
    private readonly config: AppConfigService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  async create(userId: string, dto: CreateBacktestDto, requestId?: string) {
    const requestStartedAt = performance.now();
    const dates = parseDateRange(dto.start_date, dto.end_date);
    this.assertSpanWithinBarLimit(dates.start, dates.end, dto.timeframe);
    const symbol = await this.marketData.lookupSymbol(dto.symbol);
    const run = await this.backtests.createRun({
      userId,
      strategyId: dto.strategy_id,
      ...(dto.strategy_version_id === undefined
        ? {}
        : { strategyVersionId: dto.strategy_version_id }),
      symbolId: symbol.id,
      timeframe: dto.timeframe,
      startDate: dates.start,
      endDate: dates.end,
      initialEquity: dto.initial_equity ?? 10_000,
      simulation: dto.simulation,
    });
    let job: JobRecord;
    try {
      job = await this.jobs.createJob({
        jobType: 'backtest_run',
        userId,
        payload: {
          backtest_run_id: run.id,
          user_id: userId,
          strategy_id: run.strategyId,
          symbol: symbol.symbol,
          timeframe: run.timeframe,
          start_date: run.startDate.toISOString(),
          end_date: run.endDate.toISOString(),
          ...(requestId ? { request_id: requestId } : {}),
        },
      });
    } catch (error) {
      await this.failRunAfterInfrastructureError(run.id, userId, error);
      this.recordInfrastructureFailure(error, requestStartedAt);
      throw error;
    }
    await this.audit.record({
      userId,
      eventType: 'backtest.requested',
      payload: {
        backtest_run_id: run.id,
        job_id: job.id,
        strategy_id: run.strategyId,
        symbol: symbol.symbol,
        timeframe: run.timeframe,
      },
    });

    let terminal: JobRecord;
    try {
      terminal = await this.executor.execute(job.id);
    } catch (error) {
      await this.failRunAfterInfrastructureError(run.id, userId, error);
      this.recordInfrastructureFailure(error, requestStartedAt);
      throw error;
    }
    const durationMs = Math.max(
      0,
      (terminal.finishedAt?.getTime() ?? Date.now()) -
        (terminal.startedAt?.getTime() ?? terminal.createdAt.getTime()),
    );
    if (terminal.status !== 'completed') {
      const code = terminal.payload.error_code ?? ErrorCode.INTERNAL_ERROR;
      await this.backtests.ensureTerminalFailure(run.id, userId, {
        code,
        message: terminal.errorMessage ?? 'Backtest execution failed.',
      });
      this.metrics.recordBacktest(
        terminal.status === 'timed_out' ? 'timed_out' : 'failed',
        durationMs,
      );
      throw new DomainError(code, terminal.errorMessage);
    }
    this.metrics.recordBacktest('completed', durationMs);
    const detail = await this.backtests.getRun(run.id, userId);
    if (!detail) {
      throw backtestNotFoundError(run.id);
    }
    return {
      run: serializeRun(
        detail.run,
        symbol.symbol,
        terminal.payload.diagnostics,
      ),
      results: serializeResult(detail.result),
    };
  }

  async list(userId: string, query: ListBacktestsQueryDto) {
    const symbol = query.symbol
      ? await this.marketData.lookupSymbol(query.symbol)
      : undefined;
    const page = await this.backtests.listRunPage(userId, {
      strategyId: query.strategy_id,
      symbolId: symbol?.id,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
    const [symbols, names] = await Promise.all([
      this.marketData.getSymbolsByIds(
        page.items.map((item) => item.run.symbolId),
      ),
      this.strategies.getOwnedStrategyNames(
        userId,
        page.items.map((item) => item.run.strategyId),
      ),
    ]);
    const symbolNames = new Map(symbols.map((item) => [item.id, item.symbol]));
    return {
      items: page.items.map((item) =>
        serializeListItem(
          item,
          symbolNames.get(item.run.symbolId) ?? 'UNKNOWN',
          names.get(item.run.strategyId) ?? 'Deleted strategy',
        ),
      ),
      limit: page.limit,
      offset: page.offset,
      has_more: page.hasMore,
    };
  }

  async detail(userId: string, runId: string, query: BacktestDetailQueryDto) {
    const detail = await this.backtests.getRunPage(
      runId,
      userId,
      query.trades_limit ?? 500,
      query.trades_offset ?? 0,
    );
    if (!detail) {
      throw backtestNotFoundError(runId);
    }
    const symbol = (
      await this.marketData.getSymbolsByIds([detail.run.symbolId])
    )[0];
    return serializeDetail(detail, symbol?.symbol ?? 'UNKNOWN');
  }

  async research(userId: string, runId: string) {
    const detail = await this.backtests.getRun(runId, userId);
    if (!detail) throw backtestNotFoundError(runId);
    const pinned = await this.strategies.resolvePinnedVersionForRun(
      userId,
      detail.run.strategyId,
      detail.run.strategyVersionId,
    );
    const symbol = (
      await this.marketData.getSymbolsByIds([detail.run.symbolId])
    )[0];
    return {
      run: serializeRun(detail.run, symbol?.symbol ?? 'UNKNOWN'),
      results: serializeResult(detail.result),
      definition: pinned.definition,
      version_number: pinned.versionNumber,
    };
  }

  async exportTrades(userId: string, runId: string): Promise<string> {
    const detail = await this.backtests.getRun(runId, userId);
    if (!detail) throw backtestNotFoundError(runId);
    const rows = [
      [
        'entry_time',
        'exit_time',
        'side',
        'entry_price',
        'exit_price',
        'quantity',
        'fees_abs',
        'pnl_abs',
        'pnl_pct',
      ],
      ...detail.trades.map((trade) => [
        trade.entryTime.toISOString(),
        trade.exitTime.toISOString(),
        trade.side,
        trade.entryPrice,
        trade.exitPrice,
        trade.quantity,
        trade.feesAbs ?? '0',
        trade.pnlAbs,
        trade.pnlPct,
      ]),
    ];
    return csv(rows);
  }

  async exportResults(userId: string, runId: string): Promise<string> {
    const research = await this.research(userId, runId);
    const metrics = research.results;
    return csv([
      [
        'run_id',
        'strategy_id',
        'version_number',
        'symbol',
        'timeframe',
        'start_date',
        'end_date',
        'initial_equity',
        'simulation',
        'definition',
        'results',
      ],
      [
        research.run.id,
        research.run.strategy_id,
        research.version_number,
        research.run.symbol,
        research.run.timeframe,
        research.run.start_date,
        research.run.end_date,
        research.run.initial_equity,
        JSON.stringify(
          research.run.simulation ?? {
            allocation_pct: 100,
            commission_bps: 0,
            slippage_bps: 0,
            execution_timing: 'signal_close',
            evaluation_period: 'research',
          },
        ),
        JSON.stringify(research.definition),
        JSON.stringify(metrics),
      ],
    ]);
  }

  private assertSpanWithinBarLimit(
    start: Date,
    end: Date,
    timeframe: '1d' | '1h',
  ): void {
    const unit = timeframe === '1h' ? HOUR_MS : DAY_MS;
    const upperBound = Math.floor((end.getTime() - start.getTime()) / unit) + 1;
    if (upperBound > this.config.backtest.maxBars) {
      throw new DomainError(
        ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
        `Requested range can contain ${upperBound} bars; the limit is ${this.config.backtest.maxBars}.`,
      );
    }
  }

  private async failRunAfterInfrastructureError(
    runId: string,
    userId: string,
    error: unknown,
  ): Promise<void> {
    const code =
      error instanceof DomainError ? error.code : ErrorCode.INTERNAL_ERROR;
    try {
      await this.backtests.ensureTerminalFailure(runId, userId, {
        code,
        message: 'Backtest execution failed.',
      });
    } catch (cleanupError) {
      this.logger.error({
        event: 'backtest.terminal_cleanup_failed',
        backtestRunId: runId,
        userId,
        error:
          cleanupError instanceof Error
            ? cleanupError.name
            : 'UnknownCleanupError',
      });
    }
  }

  private recordInfrastructureFailure(error: unknown, startedAt: number): void {
    const status =
      error instanceof DomainError && error.code === ErrorCode.BACKTEST_TIMEOUT
        ? 'timed_out'
        : 'failed';
    this.metrics.recordBacktest(
      status,
      Math.max(0, performance.now() - startedAt),
    );
  }
}

function parseDateRange(startValue: string, endValue: string) {
  const start = parseApiDate(startValue, false);
  const end = parseApiDate(endValue, true);
  if (start.getTime() >= end.getTime()) {
    throw backtestValidationError(
      'end_date',
      'end_date must be after start_date.',
    );
  }
  return { start, end };
}

function parseApiDate(value: string, endOfDay: boolean): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const normalized = dateOnly
    ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
    : value;
  if (!dateOnly && !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw backtestValidationError(
      endOfDay ? 'end_date' : 'start_date',
      'Timestamp values must include a UTC offset.',
    );
  }
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    throw backtestValidationError(
      endOfDay ? 'end_date' : 'start_date',
      'Date must be valid ISO 8601.',
    );
  }
  return date;
}

function serializeRun(
  run: BacktestRunRecord,
  symbol: string,
  diagnostics?: unknown,
) {
  return {
    id: run.id,
    strategy_id: run.strategyId,
    strategy_version_id: run.strategyVersionId,
    symbol,
    timeframe: run.timeframe,
    start_date: run.startDate.toISOString(),
    end_date: run.endDate.toISOString(),
    initial_equity: run.initialEquity,
    ...(run.simulation ? { simulation: run.simulation } : {}),
    status: run.status,
    ...(run.jobId ? { job_id: run.jobId } : {}),
    ...(run.errorMessage ? { error_message: run.errorMessage } : {}),
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    ...(run.startedAt ? { started_at: run.startedAt.toISOString() } : {}),
    ...(run.finishedAt ? { finished_at: run.finishedAt.toISOString() } : {}),
    ...(diagnostics && typeof diagnostics === 'object' ? { diagnostics } : {}),
  };
}

function serializeResult(result: BacktestResultRecord | null) {
  return result
    ? {
        ...(result.benchmark ? { benchmark: result.benchmark } : {}),
        final_equity: result.finalEquity,
        total_return_pct: result.totalReturnPct,
        max_drawdown_pct: result.maxDrawdownPct,
        win_rate_pct: result.winRatePct,
        num_trades: result.numTrades,
        avg_win_pct: result.avgWinPct,
        avg_loss_pct: result.avgLossPct,
        sharpe_ratio: result.sharpeRatio,
      }
    : null;
}

function serializeListItem(
  item: BacktestRunSummary,
  symbol: string,
  strategyName: string,
) {
  return {
    ...serializeRun(item.run, symbol),
    strategy_name: strategyName,
    ...(item.result
      ? {
          total_return_pct: item.result.totalReturnPct,
          max_drawdown_pct: item.result.maxDrawdownPct,
          num_trades: item.result.numTrades,
        }
      : {}),
  };
}

function serializeTrade(trade: BacktestTradeRecord) {
  return {
    id: trade.id,
    symbol_id: trade.symbolId,
    entry_time: trade.entryTime.toISOString(),
    exit_time: trade.exitTime.toISOString(),
    side: trade.side,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice,
    quantity: trade.quantity,
    fees_abs: trade.feesAbs ?? '0.00000000',
    pnl_abs: trade.pnlAbs,
    pnl_pct: trade.pnlPct,
  };
}

function serializeDetail(detail: BacktestRunDetailPage, symbol: string) {
  return {
    run: serializeRun(detail.run, symbol),
    results: serializeResult(detail.result),
    trades: detail.trades.map(serializeTrade),
    trades_page: {
      limit: detail.tradesPage.limit,
      offset: detail.tradesPage.offset,
      has_more: detail.tradesPage.hasMore,
    },
    equity_curve: detail.equityCurve.map((point) => ({
      timestamp: point.timestamp.toISOString(),
      equity: point.equity,
    })),
  };
}
