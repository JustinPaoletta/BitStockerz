import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { MarketDataIngestionService } from '../market-data/ingestion/market-data-ingestion.service';
import { JobExecutorService } from './job-executor.service';
import { JobsService } from './jobs.service';
import type { JobPayload, JobRecord, JobType } from './jobs.types';

@Injectable()
export class JobHandlersService {
  constructor(
    private readonly ingestionService: MarketDataIngestionService,
    private readonly jobsService: JobsService,
    private readonly executor: JobExecutorService,
    private readonly config: AppConfigService,
  ) {
    this.executor.registerHandler(
      'equity_daily_import',
      this.handleEquityImport.bind(this),
    );
    this.executor.registerHandler(
      'crypto_import',
      this.handleCryptoImport.bind(this),
    );
    this.executor.registerHandler(
      'market_data_scheduled',
      this.handleScheduledImport.bind(this),
    );
  }

  async createAndRun(
    jobType: JobType,
    userId: string,
    payload: JobPayload = {},
  ): Promise<JobRecord> {
    const job = await this.jobsService.createJob({ jobType, userId, payload });
    return this.executor.execute(job.id);
  }

  async runScheduledImports(): Promise<JobRecord> {
    return this.createAndRun(
      'market_data_scheduled',
      this.config.jobs.systemUserId,
      { trigger: 'scheduler' },
    );
  }

  private async handleEquityImport(job: JobRecord): Promise<JobPayload> {
    const result = await this.ingestionService.importEquityDaily({
      symbol: job.payload.symbol,
    });

    return {
      ...job.payload,
      imported_equity_bars: result.importedBars,
      symbols_processed: result.symbolsProcessed,
    };
  }

  private async handleCryptoImport(job: JobRecord): Promise<JobPayload> {
    const result = await this.ingestionService.importCrypto({
      symbol: job.payload.symbol,
      intervals: job.payload.intervals,
    });

    return {
      ...job.payload,
      imported_crypto_daily_bars: result.importedDailyBars,
      imported_crypto_hourly_bars: result.importedHourlyBars,
      symbols_processed: result.symbolsProcessed,
    };
  }

  private async handleScheduledImport(job: JobRecord): Promise<JobPayload> {
    const equity = await this.ingestionService.importEquityDaily();
    const crypto = await this.ingestionService.importCrypto();

    return {
      ...job.payload,
      imported_equity_bars: equity.importedBars,
      imported_crypto_daily_bars: crypto.importedDailyBars,
      imported_crypto_hourly_bars: crypto.importedHourlyBars,
      symbols_processed: equity.symbolsProcessed + crypto.symbolsProcessed,
    };
  }
}
