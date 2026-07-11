import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AUTH_TOKEN_REQUEST_KEY,
  AuthGuard,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { CreateJobDto } from './dto/create-job.dto';
import { JobHandlersService } from './job-handlers.service';
import { JobsService } from './jobs.service';
import type { JobPayload, JobRecord } from './jobs.types';

@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobHandlers: JobHandlersService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  async createJob(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateJobDto,
  ) {
    const userId = this.requireUserId(request);
    const payload = toJobPayload(body);
    const job: JobRecord = await this.jobHandlers.createAndRun(
      body.job_type,
      userId,
      payload,
    );
    return this.jobsService.toJobResponse(job);
  }

  @Get(':id')
  async getJob(
    @Req() request: AuthenticatedRequest,
    @Param('id') jobId: string,
  ) {
    const userId = this.requireUserId(request);
    const job = await this.jobsService.getJobForUser(jobId, userId);
    return this.jobsService.toJobResponse(job);
  }

  private requireUserId(request: Request & AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new Error('Auth token missing from request context.');
    }

    return this.authService.requireUserBySessionToken(token).id;
  }
}

function toJobPayload(body: CreateJobDto): JobPayload {
  return {
    ...(body.symbol ? { symbol: body.symbol.trim().toUpperCase() } : {}),
    ...(body.intervals ? { intervals: body.intervals } : {}),
  };
}
