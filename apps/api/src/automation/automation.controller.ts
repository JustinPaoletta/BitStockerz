import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../docs/openapi.decorators';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AuthGuard,
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { AutomationService } from './automation.service';
import { MarketDataService } from '../market-data/market-data.service';
class CreateDto {
  @IsUUID('4') strategy_id!: string;
  @IsString() @MaxLength(32) symbol!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100)
  allocation_pct!: number;
}
class ControlDto {
  @IsIn(['active', 'paused', 'stopped']) status!:
    'active' | 'paused' | 'stopped';
}
@ApiTags('Paper Strategy Runners')
@Controller('automations')
@UseGuards(AuthGuard)
export class AutomationController {
  constructor(
    private readonly service: AutomationService,
    private readonly auth: AuthService,
    private readonly market: MarketDataService,
  ) {}
  private user(req: AuthenticatedRequest) {
    return this.auth.requireUserBySessionToken(req[AUTH_TOKEN_REQUEST_KEY]!).id;
  }
  @ApiEndpoint({
    summary: 'Get paper strategy runners',
    responseDescription: 'Owner-scoped paper strategy runners operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get()
  async list(@Req() req: AuthenticatedRequest) {
    return {
      automations: await Promise.all(
        (await this.service.list(this.user(req))).map((record) =>
          this.serialize(record),
        ),
      ),
    };
  }
  @ApiEndpoint({
    summary: 'Post paper strategy runners',
    responseDescription: 'Owner-scoped paper strategy runners operation.',
    authenticated: true,
    status: 201,
    errors: [400, 401, 404, 409, 500],
  })
  @Post()
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateDto) {
    return this.serialize(await this.service.create(this.user(req), body));
  }
  @ApiEndpoint({
    summary: 'Post :id/control',
    responseDescription: 'Owner-scoped paper strategy runners operation.',
    authenticated: true,
    status: 201,
    errors: [400, 401, 404, 409, 500],
  })
  @Post(':id/control')
  async control(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ControlDto,
  ) {
    return this.serialize(
      await this.service.control(this.user(req), id, body.status),
    );
  }
  @ApiEndpoint({
    summary: 'Post :id/evaluate',
    responseDescription: 'Owner-scoped paper strategy runners operation.',
    authenticated: true,
    status: 201,
    errors: [400, 401, 404, 409, 500],
  })
  @Post(':id/evaluate')
  async evaluate(
    @Req() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.serialize(await this.service.evaluate(this.user(req), id));
  }
  private async serialize(
    record: Awaited<ReturnType<AutomationService['create']>>,
  ) {
    const [symbol] = await this.market.getSymbolsByIds([record.symbolId]);
    return {
      ...serialize(record),
      symbol: symbol?.symbol ?? 'Unavailable symbol',
    };
  }
}
function serialize(record: Awaited<ReturnType<AutomationService['create']>>) {
  return {
    id: record.id,
    strategy_id: record.strategyId,
    strategy_version_id: record.strategyVersionId,
    symbol_id: record.symbolId,
    timeframe: record.timeframe,
    status: record.status,
    allocation_pct: record.allocationPct.toString(),
    state: record.stateJson,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}
