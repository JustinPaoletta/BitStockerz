import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../docs/openapi.decorators';
import { computeIndicators } from '../backtest/engine/indicators';
import { StrategiesService } from '../strategies/strategies.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  MaxLength,
  Equals,
  IsIn,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import {
  AuthGuard,
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ProductService } from './product.service';

class ChartQueryDto {
  @IsString() @MaxLength(32) symbol!: string;
  @IsIn(['1d', '1h']) timeframe!: '1d' | '1h';
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)?$/)
  @IsISO8601({ strict: true })
  start!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z)?$/)
  @IsISO8601({ strict: true })
  end!: string;
  @IsOptional() @IsUUID('4') strategy_id?: string;
}
class SymbolDto {
  @IsString() @MaxLength(32) symbol!: string;
}
class ConfirmationDto {
  @IsString() @MaxLength(255) confirmation!: string;
}
class ResetDto {
  @Equals('RESET') confirmation!: string;
}

@ApiTags('Workspace')
@Controller('workspace')
@UseGuards(AuthGuard)
export class ProductController {
  constructor(
    private readonly product: ProductService,
    private readonly auth: AuthService,
    private readonly market: MarketDataService,
    private readonly strategies: StrategiesService,
  ) {}
  private token(req: AuthenticatedRequest) {
    return req[AUTH_TOKEN_REQUEST_KEY]!;
  }
  private user(req: AuthenticatedRequest) {
    return this.auth.requireUserBySessionToken(this.token(req)).id;
  }
  @ApiEndpoint({
    summary: 'Get watchlist',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('watchlist')
  async list(@Req() req: AuthenticatedRequest) {
    const result = await this.product.watchlist(this.user(req));
    return {
      symbols: result.symbols.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
        asset_type: item.asset_type,
      })),
    };
  }
  @ApiEndpoint({
    summary: 'Post watchlist',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Post('watchlist')
  @HttpCode(204)
  save(@Req() req: AuthenticatedRequest, @Body() body: SymbolDto) {
    return this.product.saveWatchlistSymbol(this.user(req), body.symbol);
  }
  @ApiEndpoint({
    summary: 'Delete watchlist/:symbol',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Delete('watchlist/:symbol')
  @HttpCode(204)
  remove(@Req() req: AuthenticatedRequest, @Param('symbol') symbol: string) {
    return this.product.removeWatchlistSymbol(this.user(req), symbol);
  }
  @ApiEndpoint({
    summary: 'Get chart',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('chart')
  async chart(@Req() req: AuthenticatedRequest, @Query() query: ChartQueryDto) {
    const symbol = await this.market.lookupSymbol(query.symbol);
    if (symbol.asset_type === 'EQUITY' && query.timeframe !== '1d')
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Equities support daily bars.',
      );
    const start = new Date(
      query.start.length === 10 ? query.start + 'T00:00:00.000Z' : query.start,
    );
    const end = new Date(
      query.end.length === 10 ? query.end + 'T23:59:59.999Z' : query.end,
    );
    if (
      start > end ||
      end.getTime() - start.getTime() >=
        5000 * (query.timeframe === '1d' ? 86400000 : 3600000)
    )
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Choose an ordered range of at most 5000 bars.',
      );
    const bars = await this.market.getBacktestBars({
      symbolId: symbol.id,
      assetType: symbol.asset_type,
      timeframe: query.timeframe,
      start,
      end,
      limit: 5000,
    });
    const strategy = query.strategy_id
      ? await this.strategies.getById(this.user(req), query.strategy_id)
      : undefined;
    if (
      strategy &&
      (strategy.asset_type !== symbol.asset_type ||
        strategy.timeframe !== query.timeframe)
    )
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Strategy asset type and timeframe must match the chart.',
      );
    const series = strategy
      ? computeIndicators(strategy.definition.indicators, bars)
      : {};
    return {
      symbol: symbol.symbol,
      timeframe: query.timeframe,
      data_mode: this.product.dataMode,
      bars: bars.map((bar) => ({
        timestamp: bar.ts.toISOString(),
        open: String(bar.open),
        high: String(bar.high),
        low: String(bar.low),
        close: String(bar.close),
        volume: String(bar.volume),
      })),
      indicators: (strategy?.definition.indicators ?? []).map((indicator) => ({
        id: indicator.id,
        type: indicator.type,
        period: indicator.params.period,
        points: bars.flatMap((bar, index) =>
          series[indicator.id][index] === null
            ? []
            : [
                {
                  timestamp: bar.ts.toISOString(),
                  value: String(series[indicator.id][index]),
                },
              ],
        ),
      })),
    };
  }
  @ApiEndpoint({
    summary: 'Get prices/:symbol',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('prices/:symbol')
  async price(@Param('symbol') symbol: string) {
    return this.market.getLatestClose(symbol);
  }
  @ApiEndpoint({
    summary: 'Post paper/reset',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Post('paper/reset')
  @HttpCode(204)
  reset(@Req() req: AuthenticatedRequest, @Body() body: ResetDto) {
    void body;
    return this.product.resetAccount(this.token(req));
  }
  @ApiEndpoint({
    summary: 'Get paper/archives',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('paper/archives')
  archives(@Req() req: AuthenticatedRequest) {
    return this.product.accountArchives(this.user(req));
  }
  @ApiEndpoint({
    summary: 'Get account-export',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('account-export')
  @Header(
    'Content-Disposition',
    'attachment; filename="bitstockerz-account.json"',
  )
  export(@Req() req: AuthenticatedRequest) {
    return this.product.exportUser(this.token(req));
  }
  @ApiEndpoint({
    summary: 'Delete account',
    responseDescription: 'Owner-scoped workspace operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Delete('account')
  @HttpCode(204)
  delete(@Req() req: AuthenticatedRequest, @Body() body: ConfirmationDto) {
    return this.product.deleteUser(this.token(req), body.confirmation);
  }
}
