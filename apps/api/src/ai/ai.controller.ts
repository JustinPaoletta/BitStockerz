import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { BacktestIntelligenceService } from './backtest-intelligence.service';
import {
  ExplainBacktestDto,
  ExplainStrategyDto,
  SuggestImprovementsDto,
  ValidateStrategyAiDto,
} from './dto/ai.dto';
import { StrategyIntelligenceService } from './strategy-intelligence.service';

@ApiTags('AI / Kernel')
@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(
    private readonly strategyIntelligence: StrategyIntelligenceService,
    private readonly backtestIntelligence: BacktestIntelligenceService,
    private readonly authService: AuthService,
  ) {}

  @Post('explain-strategy')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Explain a strategy',
    description:
      'Returns a plain-English advisory explanation of an owned strategy definition.',
    authenticated: true,
    responseDescription: 'Strategy explanation envelope.',
    responseSchema: apiSchemaRef('AiExplainStrategyResponse'),
    errors: [400, 401, 404, 429, 500, 502, 503, 504],
  })
  async explainStrategy(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ExplainStrategyDto,
  ) {
    return this.strategyIntelligence.explainStrategy(
      this.requireUserId(request),
      dto.strategy_id,
    );
  }

  @Post('validate-strategy')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Validate strategy logic',
    description:
      'Detects logical red flags using deterministic checks plus advisory AI review.',
    authenticated: true,
    responseDescription: 'Strategy warnings envelope.',
    responseSchema: apiSchemaRef('AiValidateStrategyResponse'),
    errors: [400, 401, 404, 429, 500, 502, 503, 504],
  })
  async validateStrategy(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ValidateStrategyAiDto,
  ) {
    return this.strategyIntelligence.validateStrategy(
      this.requireUserId(request),
      dto.strategy_id,
    );
  }

  @Post('explain-backtest')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Explain a backtest',
    description:
      'Explains completed backtest metrics and identifies failure-mode issues.',
    authenticated: true,
    responseDescription: 'Backtest explanation envelope.',
    responseSchema: apiSchemaRef('AiExplainBacktestResponse'),
    errors: [400, 401, 404, 409, 429, 500, 502, 503, 504],
  })
  async explainBacktest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ExplainBacktestDto,
  ) {
    return this.backtestIntelligence.explainBacktest(
      this.requireUserId(request),
      dto.backtest_run_id,
    );
  }

  @Post('suggest-improvements')
  @HttpCode(HttpStatus.OK)
  @ApiEndpoint({
    summary: 'Suggest strategy improvements',
    description:
      'Returns advisory improvement suggestions for an owned strategy, optionally informed by a completed backtest.',
    authenticated: true,
    responseDescription: 'Suggestions envelope.',
    responseSchema: apiSchemaRef('AiSuggestImprovementsResponse'),
    errors: [400, 401, 404, 409, 429, 500, 502, 503, 504],
  })
  async suggestImprovements(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SuggestImprovementsDto,
  ) {
    return this.backtestIntelligence.suggestImprovements(
      this.requireUserId(request),
      dto.strategy_id,
      dto.backtest_run_id,
    );
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
    return this.authService.requireUserBySessionToken(token).id;
  }
}
