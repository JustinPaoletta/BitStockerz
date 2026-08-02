import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { BacktestTimeframe } from '../backtests.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const preserveRawValue = ({ value }: { value: unknown }) => value;

export class CreateBacktestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  strategy_id!: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Internal immutable strategy-version ID. Omit to pin latest.',
  })
  @IsOptional()
  @ApiProperty({ example: 'AAPL' })
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  strategy_version_id?: number;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  symbol!: string;

  @ApiProperty({ enum: ['1d', '1h'] })
  @IsIn(['1d', '1h'])
  timeframe!: BacktestTimeframe;

  @ApiProperty({
    example: '2026-01-01',
    description:
      'ISO 8601 date or timestamp. Timestamps must include an offset.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  start_date!: string;

  @ApiProperty({
    example: '2026-06-30',
    description:
      'ISO 8601 date or timestamp after start_date. Date-only ranges are inclusive.',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  end_date!: string;

  @ApiPropertyOptional({
    type: 'number',
    minimum: 0,
    exclusiveMinimum: true,
    default: 10000,
    example: 10000,
    description: 'Positive starting equity with at most two decimal places.',
  })
  @IsOptional()
  @Transform(preserveRawValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  initial_equity?: number;
}
