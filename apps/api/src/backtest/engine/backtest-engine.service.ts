import { Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { AppConfigService } from '../../config/app-config.service';
import type {
  BacktestEngineInput,
  BacktestEngineOutput,
  ResolvedBacktestLimits,
} from './backtest-engine.types';
import { runBacktest } from './run';

@Injectable()
export class BacktestEngineService {
  constructor(private readonly config: AppConfigService) {}

  run(input: BacktestEngineInput): BacktestEngineOutput {
    const limits = this.resolveLimits(input.limits);
    const deadlineSignal = AbortSignal.timeout(limits.timeoutMs);
    const signal = input.signal
      ? AbortSignal.any([input.signal, deadlineSignal])
      : deadlineSignal;
    return runBacktest({
      ...input,
      signal,
      limits,
    });
  }

  private resolveLimits(
    requested: BacktestEngineInput['limits'],
  ): ResolvedBacktestLimits {
    return {
      maxBars: capRequestedLimit(
        'maxBars',
        requested?.maxBars,
        this.config.backtest.maxBars,
      ),
      timeoutMs: capRequestedLimit(
        'timeoutMs',
        requested?.timeoutMs,
        this.config.backtest.timeoutMs,
      ),
      maxSeriesCells: capRequestedLimit(
        'maxSeriesCells',
        requested?.maxSeriesCells,
        this.config.backtest.maxSeriesCells,
      ),
    };
  }
}

function capRequestedLimit(
  name: string,
  requested: number | undefined,
  configured: number,
): number {
  if (requested === undefined) {
    return configured;
  }
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    throw new DomainError(
      ErrorCode.BACKTEST_INVALID_DEFINITION,
      `${name} must be a positive integer.`,
    );
  }
  return Math.min(requested, configured);
}
