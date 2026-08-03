import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FillPriceService } from './fill-price.service';
import { OrderRiskService } from './order-risk.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaperAccountProvisioningModule } from './paper-account-provisioning.module';
import { PaperAccountsController } from './paper-accounts.controller';
import { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import { TradingLedgerService } from './trading-ledger.service';
import { TradingViewsController } from './trading-views.controller';
import { TradingViewsService } from './trading-views.service';

@Module({
  imports: [
    AuthModule,
    MarketDataModule,
    ObservabilityModule,
    PaperAccountProvisioningModule,
    PrismaModule,
  ],
  controllers: [
    PaperAccountsController,
    OrdersController,
    TradingViewsController,
  ],
  providers: [
    FillPriceService,
    OrderRiskService,
    OrdersService,
    PaperAccountsService,
    PositionsService,
    TradingLedgerService,
    TradingViewsService,
  ],
  exports: [
    FillPriceService,
    OrdersService,
    PaperAccountsService,
    PositionsService,
    TradingLedgerService,
    TradingViewsService,
  ],
})
export class TradingModule {}
