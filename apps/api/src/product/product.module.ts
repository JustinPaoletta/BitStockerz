import { AutomationModule } from '../automation/automation.module';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BacktestModule } from '../backtest/backtest.module';
import { JobsModule } from '../jobs/jobs.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StrategiesModule } from '../strategies/strategies.module';
import { PaperAccountProvisioningModule } from '../trading/paper-account-provisioning.module';
import { TradingModule } from '../trading/trading.module';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    AutomationModule,
    AuthModule,
    BacktestModule,
    JobsModule,
    MarketDataModule,
    ObservabilityModule,
    PrismaModule,
    StrategiesModule,
    PaperAccountProvisioningModule,
    TradingModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
