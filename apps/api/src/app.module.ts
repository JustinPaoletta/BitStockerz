import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { ErrorTestController } from './error-test/error-test.controller';
import { buildPinoLoggerOptions } from './common/logging/pino.config';
import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter';
import { AppLogger } from './common/logging/app-logger';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { AuthModule } from './auth/auth.module';
import { JobsModule } from './jobs/jobs.module';
import { MarketDataModule } from './market-data/market-data.module';
import { MetricsInterceptor } from './observability/metrics.interceptor';
import { ObservabilityModule } from './observability/observability.module';
import { StrategiesModule } from './strategies/strategies.module';
import { BacktestModule } from './backtest/backtest.module';
import { TradingModule } from './trading/trading.module';

@Module({
  imports: [
    AppConfigModule,
    AuthModule,
    MarketDataModule,
    JobsModule,
    ObservabilityModule,
    StrategiesModule,
    BacktestModule,
    TradingModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        buildPinoLoggerOptions(config.logging),
    }),
  ],
  controllers: [AppController, HealthController, ErrorTestController],
  providers: [
    AppService,
    HealthService,
    GlobalHttpExceptionFilter,
    AppLogger,
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
