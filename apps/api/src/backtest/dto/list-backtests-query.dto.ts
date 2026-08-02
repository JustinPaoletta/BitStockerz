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
import { ApiPropertyOptional } from '@nestjs/swagger';

const optionalNumber = ({ value }: { value: unknown }) =>
  value === undefined ? undefined : Number(value);

export class ListBacktestsQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  strategy_id?: string;

  @ApiPropertyOptional({ example: 'AAPL' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({ enum: BACKTEST_STATUSES })
  @IsOptional()
  @IsIn(BACKTEST_STATUSES)
  status?: BacktestStatus;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 50,
  })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 10000,
    default: 0,
  })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number;
}

export class BacktestDetailQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 1000,
    default: 500,
  })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(1)
  @Max(1000)
  trades_limit?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 100000,
    default: 0,
  })
  @IsOptional()
  @Transform(optionalNumber)
  @IsInt()
  @Min(0)
  @Max(100_000)
  trades_offset?: number;
}
