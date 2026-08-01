import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { AuditService } from '../observability/audit.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import type { JobPayload } from './jobs.types';

@ApiTags('Market Data Ingestion')
@Controller('market-data/ingestion')
@UseGuards(AuthGuard)
export class IngestionController {
  constructor(
    private readonly jobHandlers: JobHandlersService,
    private readonly jobsService: JobsService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('equity')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: {
          type: 'string',
          description:
            'Optional active equity ticker. Omit to import all fixtures.',
          example: 'AAPL',
        },
      },
    },
  })
  @ApiEndpoint({
    summary: 'Import equity daily fixtures',
    description:
      'Runs the deterministic equity fixture importer and upserts bars when MySQL is enabled.',
    status: 201,
    authenticated: true,
    responseDescription: 'Completed equity import job.',
    responseSchema: apiSchemaRef('Job'),
    errors: [400, 401, 404, 500, 504],
  })
  async importEquity(
    @Req() request: AuthenticatedRequest,
    @Body() body: Pick<CreateJobDto, 'symbol'>,
  ) {
    const userId = this.requireUserId(request);
    const payload: JobPayload = body.symbol
      ? { symbol: body.symbol.trim().toUpperCase() }
      : {};
    void this.audit.record({
      userId,
      eventType: 'market_data.ingestion_requested',
      payload: { kind: 'equity', ...payload },
    });
    const job = await this.jobHandlers.createAndRun(
      'equity_daily_import',
      userId,
      payload,
    );
    return this.jobsService.toJobResponse(job);
  }

  @Post('crypto')
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        symbol: {
          type: 'string',
          description:
            'Optional active crypto pair. Omit to import all fixtures.',
          example: 'BTC-USD',
        },
        intervals: {
          type: 'array',
          description: 'Intervals to import. Omit to import both.',
          items: { type: 'string', enum: ['1d', '1h'] },
        },
      },
    },
  })
  @ApiEndpoint({
    summary: 'Import crypto fixtures',
    description:
      'Runs the deterministic crypto fixture importer and upserts daily/hourly bars when MySQL is enabled.',
    status: 201,
    authenticated: true,
    responseDescription: 'Completed crypto import job.',
    responseSchema: apiSchemaRef('Job'),
    errors: [400, 401, 404, 500, 504],
  })
  async importCrypto(
    @Req() request: AuthenticatedRequest,
    @Body() body: Pick<CreateJobDto, 'symbol' | 'intervals'>,
  ) {
    const userId = this.requireUserId(request);
    const payload: JobPayload = {
      ...(body.symbol ? { symbol: body.symbol.trim().toUpperCase() } : {}),
      ...(body.intervals ? { intervals: body.intervals } : {}),
    };
    void this.audit.record({
      userId,
      eventType: 'market_data.ingestion_requested',
      payload: { kind: 'crypto', ...payload },
    });
    const job = await this.jobHandlers.createAndRun(
      'crypto_import',
      userId,
      payload,
    );
    return this.jobsService.toJobResponse(job);
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new Error('Auth token missing from request context.');
    }

    return this.authService.requireUserBySessionToken(token).id;
  }
}
