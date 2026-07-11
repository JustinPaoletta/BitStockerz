import { IsIn, IsOptional, IsString } from 'class-validator';
import type { JobType } from '../jobs.types';

export class CreateJobDto {
  @IsIn(['equity_daily_import', 'crypto_import', 'market_data_scheduled'])
  job_type!: JobType;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(['1d', '1h'], { each: true })
  intervals?: Array<'1d' | '1h'>;
}
