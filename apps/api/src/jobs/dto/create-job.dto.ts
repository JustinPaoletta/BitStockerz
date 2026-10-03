import { IsIn } from 'class-validator';
import type { JobType } from '../jobs.types';
import { ApiProperty } from '@nestjs/swagger';
import { CryptoIngestionDto } from './ingestion.dto';

export class CreateJobDto extends CryptoIngestionDto {
  @ApiProperty({
    enum: ['equity_daily_import', 'crypto_import', 'market_data_scheduled'],
  })
  @IsIn(['equity_daily_import', 'crypto_import', 'market_data_scheduled'])
  job_type!: JobType;
}
