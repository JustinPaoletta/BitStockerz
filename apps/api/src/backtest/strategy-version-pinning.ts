import { Injectable } from '@nestjs/common';
import { StrategiesService } from '../strategies/strategies.service';
import { backtestValidationError } from './backtest-errors';
import type { PinnedStrategyVersion } from './backtests.types';

@Injectable()
export class StrategyVersionPinningService {
  constructor(private readonly strategies: StrategiesService) {}

  async resolve(
    userId: string,
    strategyId: string,
    explicitVersionId?: number,
  ): Promise<PinnedStrategyVersion> {
    if (
      explicitVersionId !== undefined &&
      (!Number.isSafeInteger(explicitVersionId) || explicitVersionId <= 0)
    ) {
      throw backtestValidationError(
        'strategyVersionId',
        'strategyVersionId must be a positive integer.',
      );
    }

    return this.strategies.resolveOwnedVersion(
      userId,
      strategyId,
      explicitVersionId,
    );
  }
}
