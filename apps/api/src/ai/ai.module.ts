import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BacktestModule } from '../backtest/backtest.module';
import { AppConfigModule } from '../config/app-config.module';
import { AppConfigService } from '../config/app-config.service';
import { JobsModule } from '../jobs/jobs.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StrategiesModule } from '../strategies/strategies.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiUsageService } from './ai-usage.service';
import { BacktestIntelligenceService } from './backtest-intelligence.service';
import { AI_PROVIDER } from './providers/ai-provider';
import { OpenAiProvider } from './providers/openai.provider';
import { StubProvider } from './providers/stub.provider';
import { StrategyIntelligenceService } from './strategy-intelligence.service';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    PrismaModule,
    ObservabilityModule,
    StrategiesModule,
    BacktestModule,
    JobsModule,
    MarketDataModule,
  ],
  controllers: [AiController],
  providers: [
    AiUsageService,
    AiService,
    StrategyIntelligenceService,
    BacktestIntelligenceService,
    StubProvider,
    OpenAiProvider,
    {
      provide: AI_PROVIDER,
      inject: [AppConfigService, StubProvider, OpenAiProvider],
      useFactory: (
        config: AppConfigService,
        stub: StubProvider,
        openai: OpenAiProvider,
      ) => (config.ai.provider === 'stub' ? stub : openai),
    },
  ],
  exports: [AiService, AiUsageService],
})
export class AiModule {}
