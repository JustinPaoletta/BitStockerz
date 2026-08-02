import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ApiEndpoint,
  apiArrayOf,
  apiSchemaRef,
} from '../docs/openapi.decorators';
import { CryptoCandlesQueryDto } from './dto/crypto-candles-query.dto';
import { EquityCandlesQueryDto } from './dto/equity-candles-query.dto';
import { MarketDataService } from './market-data.service';

@ApiTags('Market Data')
@Controller('market-data')
export class CandlesController {
  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('equities/candles')
  @ApiEndpoint({
    summary: 'Read equity daily candles',
    description:
      'Returns OHLCV daily bars for an active equity symbol over an inclusive date range.',
    responseDescription: 'Equity daily candles in the requested order.',
    responseSchema: apiArrayOf('DailyCandle'),
    errors: [400, 404, 500],
  })
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
  @ApiEndpoint({
    summary: 'Read crypto candles',
    description:
      'Returns daily or hourly OHLCV bars. Daily boundaries use YYYY-MM-DD; hourly boundaries require ISO 8601 timestamps with a timezone.',
    responseDescription: 'Crypto candles in the requested order.',
    responseSchema: {
      type: 'array',
      items: {
        oneOf: [apiSchemaRef('DailyCandle'), apiSchemaRef('HourlyCandle')],
      },
    },
    errors: [400, 404, 500],
  })
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
