import { Controller, Get } from '@nestjs/common';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class MarketDataHealthController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('health')
  getHealth() {
    return this.marketDataService.getMarketDataHealth();
  }
}
