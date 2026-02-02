import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateStrategyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsIn(['EQUITY', 'CRYPTO'])
  asset_type: string;

  @IsString()
  @IsIn(['1d', '1h'])
  timeframe: string;

  @IsOptional()
  definition?: Record<string, unknown>;
}
