import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { BacktestRateLimitGuard } from './backtest-rate-limit.guard';
import { BacktestsHttpService } from './backtests-http.service';
import { CreateBacktestDto } from './dto/create-backtest.dto';
import {
  BacktestDetailQueryDto,
  ListBacktestsQueryDto,
} from './dto/list-backtests-query.dto';

type BacktestRequest = AuthenticatedRequest & { requestId?: string };

@ApiTags('Backtests')
@Controller('backtests')
@UseGuards(AuthGuard)
export class BacktestsController {
  constructor(
    private readonly http: BacktestsHttpService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(BacktestRateLimitGuard)
  @ApiEndpoint({
    summary: 'Run a backtest',
    description:
      'Pins an owned strategy version, creates a run and job, then executes synchronously within configured bar, memory, deadline, and per-user rate limits.',
    authenticated: true,
    responseDescription: 'Completed run metadata and summary results.',
    responseSchema: apiSchemaRef('BacktestCreateResponse'),
    errors: [400, 401, 404, 409, 429, 500, 504],
  })
  create(@Req() request: BacktestRequest, @Body() dto: CreateBacktestDto) {
    return this.http.create(
      this.requireUserId(request),
      dto,
      request.requestId,
    );
  }

  @Get()
  @ApiEndpoint({
    summary: 'List owned backtest runs',
    description:
      'Returns owner-scoped runs ordered by created_at descending, with optional strategy, symbol, and status filters.',
    authenticated: true,
    responseDescription: 'Page of owned backtest run summaries.',
    responseSchema: apiSchemaRef('BacktestList'),
    errors: [400, 401, 404, 500],
  })
  list(@Req() request: BacktestRequest, @Query() query: ListBacktestsQueryDto) {
    return this.http.list(this.requireUserId(request), query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiEndpoint({
    summary: 'Read backtest run details',
    description:
      'Returns run metadata, results, a page of trades, and the complete equity curve. Missing and cross-owner IDs are indistinguishable.',
    authenticated: true,
    responseDescription: 'Owned backtest run details.',
    responseSchema: apiSchemaRef('BacktestDetail'),
    errors: [400, 401, 404, 500],
  })
  detail(
    @Req() request: BacktestRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query() query: BacktestDetailQueryDto,
  ) {
    return this.http.detail(this.requireUserId(request), id, query);
  }

  private requireUserId(request: BacktestRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
    return this.auth.requireUserBySessionToken(token).id;
  }
}
