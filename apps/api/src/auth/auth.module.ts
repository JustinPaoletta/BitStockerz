import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';
import { MeController } from './me.controller';

@Module({
  imports: [AppConfigModule, PrismaModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, AuthGuard, AuthRateLimitGuard],
  exports: [AuthService, AuthGuard, AuthRateLimitGuard],
})
export class AuthModule {}
