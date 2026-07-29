import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/app-config.module';
import { JobsModule } from '../jobs/jobs.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ObservabilityModule } from '../observability/observability.module';
import { StrategiesModule } from '../strategies/strategies.module';
import { BacktestJobHandler } from './backtest-job.handler';
import { BacktestRateLimitGuard } from './backtest-rate-limit.guard';
import { BacktestsHttpService } from './backtests-http.service';
import { BacktestsRepository } from './backtests.repository';
import { BacktestsService } from './backtests.service';
import { BacktestsController } from './backtests.controller';
import { BacktestEngineService } from './engine/backtest-engine.service';
import { StrategyVersionPinningService } from './strategy-version-pinning';

/**
 * The Sprint 3.1 engine is a logical, data-only sandbox. It does not execute
 * user code and is not an operating-system security boundary.
 */
@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    JobsModule,
    MarketDataModule,
    ObservabilityModule,
    PrismaModule,
    StrategiesModule,
  ],
  controllers: [BacktestsController],
  providers: [
    BacktestJobHandler,
    BacktestRateLimitGuard,
    BacktestEngineService,
    BacktestsHttpService,
    BacktestsRepository,
    BacktestsService,
    StrategyVersionPinningService,
  ],
  exports: [BacktestEngineService, BacktestsService],
})
export class BacktestModule {}
