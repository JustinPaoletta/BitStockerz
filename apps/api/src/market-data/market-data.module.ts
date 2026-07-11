import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CandlesController } from './candles.controller';
import { MarketDataIngestionService } from './ingestion/market-data-ingestion.service';
import { MarketDataService } from './market-data.service';
import { SymbolsController } from './symbols.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SymbolsController, CandlesController],
  providers: [MarketDataService, MarketDataIngestionService],
  exports: [MarketDataService, MarketDataIngestionService],
})
export class MarketDataModule {}
