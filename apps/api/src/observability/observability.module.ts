import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditService } from './audit.service';
import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

@Module({
  imports: [AppConfigModule, PrismaModule, forwardRef(() => AuthModule)],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor, AuditService],
  exports: [MetricsService, MetricsInterceptor, AuditService],
})
export class ObservabilityModule {}
