import { Transform, Type } from 'class-transformer';
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
  Max,
  ValidateNested,
  Min,
  MinLength,
} from 'class-validator';
import type { BacktestTimeframe } from '../backtests.types';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const preserveRawValue = ({ value }: { value: unknown }) => value;

export class SimulationSettingsDto {
  @ApiPropertyOptional({ minimum: 0.01, maximum: 100, default: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  allocation_pct?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  commission_bps?: number;
  @ApiPropertyOptional({ minimum: 0, maximum: 1000, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000)
  slippage_bps?: number;
  @ApiPropertyOptional({
    enum: ['signal_close', 'next_open'],
    default: 'signal_close',
  })
  @IsOptional()
  @IsIn(['signal_close', 'next_open'])
  execution_timing?: 'signal_close' | 'next_open';
  @ApiPropertyOptional({
    enum: ['research', 'out_of_sample'],
    default: 'research',
  })
  @IsOptional()
  @IsIn(['research', 'out_of_sample'])
  evaluation_period?: 'research' | 'out_of_sample';
}

export class CreateBacktestDto {
  @ApiPropertyOptional({ type: SimulationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SimulationSettingsDto)
  simulation?: SimulationSettingsDto;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  strategy_id!: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Internal immutable strategy-version ID. Omit to pin latest.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  strategy_version_id?: number;

  @ApiProperty({ example: 'AAPL' })
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
