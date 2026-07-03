import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MarketDataService } from './market-data.service';
import { SymbolsController } from './symbols.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SymbolsController],
  providers: [MarketDataService],
  exports: [MarketDataService],
})
export class MarketDataModule {}
