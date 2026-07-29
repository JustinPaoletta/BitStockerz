import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import type { BacktestStatus } from '../backtests.types';
import { BACKTEST_STATUSES } from '../backtests.types';

const optionalNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListBacktestsQueryDto {
  @IsOptional()
  @IsUUID('4')
  strategy_id?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsIn(BACKTEST_STATUSES)
  status?: BacktestStatus;

  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number;
}

export class BacktestDetailQueryDto {
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(1000)
  trades_limit?: number;

  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(0)
  @Max(100_000)
  trades_offset?: number;
}
