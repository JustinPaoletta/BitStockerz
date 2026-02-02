import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { HealthController } from './health/health.controller';
import { StrategiesController } from './strategies/strategies.controller';
import { ErrorTestController } from './error-test/error-test.controller';

@Module({
  imports: [],
  controllers: [AppController, HealthController, StrategiesController, ErrorTestController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
