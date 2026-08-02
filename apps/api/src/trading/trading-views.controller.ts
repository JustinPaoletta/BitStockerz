import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { TradingViewsService } from './trading-views.service';

@ApiTags('Paper Trading')
@Controller('trading')
@UseGuards(AuthGuard)
export class TradingViewsController {
  constructor(
    private readonly views: TradingViewsService,
    private readonly auth: AuthService,
  ) {}

  @Get('positions')
  @ApiEndpoint({
    summary: 'List current paper positions',
    authenticated: true,
    responseDescription: 'Non-zero positions ordered by symbol.',
    responseSchema: apiSchemaRef('PositionList'),
    errors: [401, 500],
  })
  positions(@Req() request: AuthenticatedRequest) {
    return this.views.listPositions(this.requireUserId(request));
  }

  @Get('portfolio-summary')
  @ApiEndpoint({
    summary: 'Read mark-to-market portfolio totals',
    authenticated: true,
    responseDescription:
      'Cash, position value, equity, and unrealized P&L using current eligible closes.',
    responseSchema: apiSchemaRef('PortfolioSummary'),
    errors: [401, 422, 500],
  })
  portfolioSummary(@Req() request: AuthenticatedRequest) {
    return this.views.getPortfolioSummary(this.requireUserId(request));
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) throw new DomainError(ErrorCode.UNAUTHORIZED);
    return this.auth.requireUserBySessionToken(token).id;
  }
}
