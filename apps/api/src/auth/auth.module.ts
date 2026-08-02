import { Module, forwardRef } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaperAccountProvisioningModule } from '../trading/paper-account-provisioning.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    PaperAccountProvisioningModule,
    forwardRef(() => ObservabilityModule),
  ],
  controllers: [AuthController, MeController],
  providers: [AuthService, AuthGuard, AuthRateLimitGuard],
  exports: [AuthService, AuthGuard, AuthRateLimitGuard],
})
export class AuthModule {}
