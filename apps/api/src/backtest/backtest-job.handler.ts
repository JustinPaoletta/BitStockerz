import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { JobExecutorService } from '../jobs/job-executor.service';
import type {
  JobExecutionContext,
  JobPayload,
  JobRecord,
} from '../jobs/jobs.types';
import { MarketDataService } from '../market-data/market-data.service';
import { StrategiesService } from '../strategies/strategies.service';
import { BacktestsService } from './backtests.service';
import { BacktestEngineService } from './engine/backtest-engine.service';

@Injectable()
export class BacktestJobHandler {
  private readonly logger = new Logger(BacktestJobHandler.name);

  constructor(
    executor: JobExecutorService,
    private readonly backtests: BacktestsService,
    private readonly strategies: StrategiesService,
    private readonly marketData: MarketDataService,
    private readonly engine: BacktestEngineService,
    private readonly config: AppConfigService,
  ) {
    executor.registerHandler('backtest_run', (job, context) =>
      this.handle(job, context),
    );
  }

  async handle(
    job: JobRecord,
    context: JobExecutionContext,
  ): Promise<JobPayload> {
    const runId = requirePayloadString(job.payload, 'backtest_run_id');
    const requestId = optionalPayloadString(job.payload, 'request_id');
    let runStarted = false;
    const startedAt = performance.now();

    try {
      await this.backtests.markRunning(runId, job.userId, job.id);
      runStarted = true;
      throwIfAborted(context.signal);
      const detail = await this.backtests.getRun(runId, job.userId);
      if (!detail) {
        throw new DomainError(ErrorCode.BACKTEST_NOT_FOUND);
      }
      const run = detail.run;
      const strategy = await this.strategies.resolvePinnedVersionForRun(
        job.userId,
        run.strategyId,
        run.strategyVersionId,
      );
      throwIfAborted(context.signal);
      const symbol = (await this.marketData.getSymbolsByIds([run.symbolId]))[0];
      if (!symbol) {
        throw new DomainError(
          ErrorCode.NOT_FOUND,
          'Backtest symbol was not found.',
        );
      }
      const bars = await this.marketData.getBacktestBars({
        symbolId: run.symbolId,
        assetType: strategy.assetType,
        timeframe: run.timeframe,
        start: run.startDate,
        end: run.endDate,
        limit: this.config.backtest.maxBars,
      });
      throwIfAborted(context.signal);
      if (bars.length > this.config.backtest.maxBars) {
        throw new DomainError(ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED);
      }

      this.logger.log({
        event: 'backtest.started',
        backtestRunId: run.id,
        jobId: job.id,
        userId: job.userId,
        strategyId: run.strategyId,
        symbol: symbol.symbol,
        timeframe: run.timeframe,
        bars: bars.length,
        requestId,
      });
      const output = this.engine.run({
        definition: strategy.definition,
        bars,
        initialEquity: Number(run.initialEquity),
        symbolId: run.symbolId,
        signal: context.signal,
        limits: {
          timeoutMs: Math.max(
            1,
            Math.floor(context.deadlineAtMs - performance.now()),
          ),
        },
      });
      throwIfAborted(context.signal);
      await this.backtests.completeRun(run.id, job.userId, output);
      const durationMs = Math.max(0, performance.now() - startedAt);
      this.logger.log({
        event: 'backtest.finished',
        backtestRunId: run.id,
        jobId: job.id,
        userId: job.userId,
        strategyId: run.strategyId,
        symbol: symbol.symbol,
        timeframe: run.timeframe,
        bars: bars.length,
        durationMs,
        status: 'completed',
        requestId,
      });
      return {
        ...job.payload,
        duration_ms: durationMs,
        diagnostics: {
          bars_processed: output.diagnostics.barsProcessed,
          duration_ms: output.diagnostics.durationMs,
          indicators_computed: output.diagnostics.indicatorsComputed,
          signals_fired: output.diagnostics.signalsFired,
        },
      };
    } catch (error) {
      const normalized: unknown = context.signal.aborted
        ? new DomainError(ErrorCode.BACKTEST_TIMEOUT)
        : error;
      const failure = toFailure(normalized);
      let cleanupFailed = false;
      if (runStarted) {
        try {
          await this.backtests.ensureTerminalFailure(
            runId,
            job.userId,
            failure,
          );
        } catch {
          cleanupFailed = true;
        }
      }
      this.logger.warn({
        event: 'backtest.finished',
        backtestRunId: runId,
        jobId: job.id,
        userId: job.userId,
        strategyId: optionalPayloadString(job.payload, 'strategy_id'),
        symbol: optionalPayloadString(job.payload, 'symbol'),
        timeframe: optionalPayloadString(job.payload, 'timeframe'),
        durationMs: Math.max(0, performance.now() - startedAt),
        status:
          failure.code === ErrorCode.BACKTEST_TIMEOUT ? 'timed_out' : 'failed',
        errorCode: failure.code,
        cleanupFailed,
        requestId,
      });
      throw normalized;
    }
  }
}

function requirePayloadString(payload: JobPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new DomainError(
      ErrorCode.INTERNAL_ERROR,
      'Backtest job payload is invalid.',
    );
  }
  return value;
}

function optionalPayloadString(
  payload: JobPayload,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  throw signal.reason instanceof DomainError
    ? signal.reason
    : new DomainError(ErrorCode.BACKTEST_TIMEOUT);
}

function toFailure(error: unknown): { code: ErrorCode; message: string } {
  if (error instanceof DomainError) {
    const response = error.getResponse() as { message?: string };
    return { code: error.code, message: response.message ?? error.message };
  }
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Backtest execution failed.',
  };
}
