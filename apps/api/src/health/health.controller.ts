import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiEndpoint({
    summary: 'Check process liveness',
    responseDescription: 'The API process is running.',
    responseSchema: apiSchemaRef('Liveness'),
  })
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @ApiEndpoint({
    summary: 'Check dependency readiness',
    description:
      'Checks configured database and market-data dependencies. Unconfigured optional dependencies do not make the service unready.',
    responseDescription: 'All configured dependencies are available.',
    responseSchema: apiSchemaRef('Readiness'),
  })
  @ApiResponse({
    status: 503,
    description: 'At least one configured dependency is unavailable.',
    schema: apiSchemaRef('Readiness'),
  })
  async ready(@Res({ passthrough: true }) response: Response) {
    const readiness = await this.healthService.readiness();
    if (!readiness.ready) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return readiness;
  }
}
