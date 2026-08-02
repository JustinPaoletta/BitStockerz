import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { IndicatorsController } from './indicators.controller';
import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';

@Module({
  imports: [PrismaModule, AuthModule, ObservabilityModule],
  controllers: [IndicatorsController, StrategiesController],
  providers: [StrategiesService],
  exports: [StrategiesService],
})
export class StrategiesModule {}
