import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { MetricsService } from './metrics.service';

@ApiTags('Observability')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiEndpoint({
    summary: 'Read in-process metrics',
    description:
      'Returns JSON counters and bounded duration summaries. Metrics reset when the process restarts.',
    responseDescription: 'Current in-process metrics snapshot.',
    responseSchema: apiSchemaRef('MetricsSnapshot'),
  })
  getMetrics() {
    return this.metricsService.snapshot();
  }
}
