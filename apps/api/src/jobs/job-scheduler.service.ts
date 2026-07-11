import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppConfigService } from '../config/app-config.service';
import { JobHandlersService } from './job-handlers.service';
import type { JobRecord } from './jobs.types';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly jobHandlers: JobHandlersService,
  ) {}

  @Cron('0 * * * *', {
    name: 'market-data-ingestion',
  })
  async runMarketDataIngestion(): Promise<void> {
    if (!this.config.jobs.schedulerEnabled) {
      return;
    }

    try {
      const job: JobRecord = await this.jobHandlers.runScheduledImports();
      this.logger.log(
        `Scheduled market data ingestion completed: ${job.id} (${job.status})`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Scheduled ingestion failed.';
      this.logger.error(`Scheduled market data ingestion failed: ${message}`);
    }
  }
}
