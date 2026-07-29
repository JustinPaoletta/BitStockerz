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

const preserveRawValue = ({ value }: { value: unknown }) => value;

export class CreateBacktestDto {
  @IsUUID('4')
  strategy_id!: string;

  @IsOptional()
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

  @IsIn(['1d', '1h'])
  timeframe!: BacktestTimeframe;

  @IsISO8601({ strict: true, strictSeparator: true })
  start_date!: string;

  @IsISO8601({ strict: true, strictSeparator: true })
  end_date!: string;

  @IsOptional()
  @Transform(preserveRawValue)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  initial_equity?: number;
}
