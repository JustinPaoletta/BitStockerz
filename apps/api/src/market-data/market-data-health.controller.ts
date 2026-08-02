import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { MarketDataService } from './market-data.service';

@ApiTags('Market Data')
@Controller('market-data')
export class MarketDataHealthController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('health')
  @ApiEndpoint({
    summary: 'Inspect market-data freshness and sanity',
    responseDescription: 'Freshness and bounded sanity results by data series.',
    responseSchema: apiSchemaRef('MarketDataHealth'),
    errors: [500],
  })
  getHealth() {
    return this.marketDataService.getMarketDataHealth();
  }
}
