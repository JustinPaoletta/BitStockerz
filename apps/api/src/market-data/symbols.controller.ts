import { Controller, Get, Param, Query } from '@nestjs/common';
import { SymbolSearchQueryDto } from './dto/symbol-search-query.dto';
import { MarketDataService } from './market-data.service';

@Controller('symbols')
export class SymbolsController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('search')
  search(@Query() query: SymbolSearchQueryDto) {
    return this.marketDataService.searchSymbols({
      q: query.q,
      assetType: query.asset_type,
      limit: query.limit,
    });
  }

  @Get(':symbol')
  lookup(@Param('symbol') symbol: string) {
    return this.marketDataService.lookupSymbol(symbol);
  }
}
