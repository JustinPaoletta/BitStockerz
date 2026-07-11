import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import type { JobPayload } from './jobs.types';

@Controller('market-data/ingestion')
@UseGuards(AuthGuard)
export class IngestionController {
  constructor(
    private readonly jobHandlers: JobHandlersService,
    private readonly jobsService: JobsService,
    private readonly authService: AuthService,
  ) {}

  @Post('equity')
  async importEquity(
    @Req() request: AuthenticatedRequest,
    @Body() body: Pick<CreateJobDto, 'symbol'>,
  ) {
    const userId = this.requireUserId(request);
    const payload: JobPayload = body.symbol
      ? { symbol: body.symbol.trim().toUpperCase() }
      : {};
    const job = await this.jobHandlers.createAndRun(
      'equity_daily_import',
      userId,
      payload,
    );
    return this.jobsService.toJobResponse(job);
  }

  @Post('crypto')
  async importCrypto(
    @Req() request: AuthenticatedRequest,
    @Body() body: Pick<CreateJobDto, 'symbol' | 'intervals'>,
  ) {
    const userId = this.requireUserId(request);
    const payload: JobPayload = {
      ...(body.symbol ? { symbol: body.symbol.trim().toUpperCase() } : {}),
      ...(body.intervals ? { intervals: body.intervals } : {}),
    };
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
