import { Controller, Get, Query } from '@nestjs/common';
import { CryptoCandlesQueryDto } from './dto/crypto-candles-query.dto';
import { EquityCandlesQueryDto } from './dto/equity-candles-query.dto';
import { MarketDataService } from './market-data.service';

@Controller('market-data')
export class CandlesController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('equities/candles')
  getEquityCandles(@Query() query: EquityCandlesQueryDto) {
    return this.marketDataService.getEquityDailyCandles({
      symbol: query.symbol,
      start: query.start,
      end: query.end,
      limit: query.limit,
      order: query.order,
    });
  }

  @Get('crypto/candles')
  getCryptoCandles(@Query() query: CryptoCandlesQueryDto) {
    return this.marketDataService.getCryptoCandles({
      symbol: query.symbol,
      interval: query.interval,
      start: query.start,
      end: query.end,
      limit: query.limit,
      order: query.order,
    });
  }
}
