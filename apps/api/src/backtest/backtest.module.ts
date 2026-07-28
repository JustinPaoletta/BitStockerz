import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { BacktestEngineService } from './engine/backtest-engine.service';

/**
 * The Sprint 3.1 engine is a logical, data-only sandbox. It does not execute
 * user code and is not an operating-system security boundary.
 */
@Module({
  imports: [AppConfigModule],
  providers: [BacktestEngineService],
  exports: [BacktestEngineService],
})
export class BacktestModule {}
