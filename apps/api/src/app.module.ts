import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { StrategiesController } from './strategies/strategies.controller';
import { ErrorTestController } from './error-test/error-test.controller';
import { buildPinoLoggerOptions } from './common/logging/pino.config';
import { GlobalHttpExceptionFilter } from './common/errors/http-exception.filter';
import { AppLogger } from './common/logging/app-logger';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => buildPinoLoggerOptions(config.logging),
    }),
  ],
  controllers: [AppController, HealthController, StrategiesController, ErrorTestController],
  providers: [AppService, HealthService, GlobalHttpExceptionFilter, AppLogger],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '*path', method: RequestMethod.ALL });
  }
}
