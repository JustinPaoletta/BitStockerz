import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CandlesController } from './candles.controller';
import { MarketDataIngestionService } from './ingestion/market-data-ingestion.service';
import { MarketDataHealthController } from './market-data-health.controller';
import { MarketDataService } from './market-data.service';
import { CandleSanityService } from './sanity/candle-sanity.service';
import { SymbolsController } from './symbols.controller';

@Module({
  imports: [PrismaModule, AppConfigModule],
  controllers: [
    SymbolsController,
    CandlesController,
    MarketDataHealthController,
  ],
  providers: [
    MarketDataService,
    MarketDataIngestionService,
    CandleSanityService,
  ],
  exports: [MarketDataService, MarketDataIngestionService, CandleSanityService],
})
export class MarketDataModule {}
