import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiEndpoint,
  apiArrayOf,
  apiSchemaRef,
} from '../docs/openapi.decorators';
import { SymbolSearchQueryDto } from './dto/symbol-search-query.dto';
import { MarketDataService } from './market-data.service';

@ApiTags('Symbols')
@Controller('symbols')
export class SymbolsController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('search')
  @ApiEndpoint({
    summary: 'Search active symbols',
    description:
      'Searches symbol and display name. With no query, returns active symbols up to the requested limit.',
    responseDescription: 'Matching active symbols.',
    responseSchema: apiArrayOf('Symbol'),
    errors: [400, 500],
  })
  search(@Query() query: SymbolSearchQueryDto) {
    return this.marketDataService.searchSymbols({
      q: query.q,
      assetType: query.asset_type,
      limit: query.limit,
    });
  }

  @Get(':symbol')
  @ApiParam({ name: 'symbol', example: 'AAPL' })
  @ApiEndpoint({
    summary: 'Look up an active symbol',
    responseDescription: 'The matching symbol.',
    responseSchema: apiSchemaRef('Symbol'),
    errors: [404, 500],
  })
  lookup(@Param('symbol') symbol: string) {
    return this.marketDataService.lookupSymbol(symbol);
  }
}
