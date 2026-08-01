import { IsIn, IsOptional, IsString } from 'class-validator';
import type { JobType } from '../jobs.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateJobDto {
  @ApiProperty({
    enum: ['equity_daily_import', 'crypto_import', 'market_data_scheduled'],
  })
  @IsIn(['equity_daily_import', 'crypto_import', 'market_data_scheduled'])
  job_type!: JobType;

  @ApiPropertyOptional({ example: 'AAPL' })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    type: [String],
    enum: ['1d', '1h'],
    description: 'Crypto intervals. Omit to import both.',
  })
  @IsOptional()
  @IsIn(['1d', '1h'], { each: true })
  intervals?: Array<'1d' | '1h'>;
}
