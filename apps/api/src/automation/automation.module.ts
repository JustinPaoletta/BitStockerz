import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StrategiesModule } from '../strategies/strategies.module';
import { TradingModule } from '../trading/trading.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
@Module({
  imports: [
    AuthModule,
    MarketDataModule,
    PrismaModule,
    StrategiesModule,
    TradingModule,
  ],
  providers: [AutomationService],
  controllers: [AutomationController],
  exports: [AutomationService],
})
export class AutomationModule {}
