import { Module } from '@nestjs/common';
import { TtlCacheService } from '../common/cache/ttl-cache.service';
import { AppConfigModule } from '../config/app-config.module';
import { ObservabilityModule } from '../observability/observability.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CandlesController } from './candles.controller';
import { MarketDataIngestionService } from './ingestion/market-data-ingestion.service';
import { MarketDataHealthController } from './market-data-health.controller';
import { MarketDataService } from './market-data.service';
import { LiveMarketDataProvider } from './providers/live.provider';
import { ProviderRouterService } from './providers/provider-router.service';
import { SeedMarketDataProvider } from './providers/seed.provider';
import { CandleSanityService } from './sanity/candle-sanity.service';
import { SymbolsController } from './symbols.controller';

@Module({
  imports: [PrismaModule, AppConfigModule, ObservabilityModule],
  controllers: [
    SymbolsController,
    CandlesController,
    MarketDataHealthController,
  ],
  providers: [
    TtlCacheService,
    SeedMarketDataProvider,
    LiveMarketDataProvider,
    ProviderRouterService,
    MarketDataService,
    MarketDataIngestionService,
    CandleSanityService,
  ],
  exports: [
    MarketDataService,
    MarketDataIngestionService,
    CandleSanityService,
    ProviderRouterService,
    TtlCacheService,
  ],
})
export class MarketDataModule {}
