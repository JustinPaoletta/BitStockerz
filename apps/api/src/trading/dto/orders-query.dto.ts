import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import type { OrderStatus } from '../trading.types';

export class OrdersQueryDto {
  @IsOptional()
  @IsEnum(['PENDING', 'FILLED', 'REJECTED', 'CANCELLED'])
  status?: OrderStatus;

  @IsOptional()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]{0,31}$/)
  symbol?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset?: number;
}
