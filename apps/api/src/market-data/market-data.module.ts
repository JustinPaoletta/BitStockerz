import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CandlesController } from './candles.controller';
import { MarketDataService } from './market-data.service';
import { SymbolsController } from './symbols.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SymbolsController, CandlesController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
