import { Transform } from 'class-transformer';
import {
  Allow,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  STRATEGY_ASSET_TYPES,
  STRATEGY_TIMEFRAMES,
  type StrategyAssetType,
  type StrategyDefinition,
  type StrategyTimeframe,
} from '../strategy.types';
import {
  preserveRawValue,
  trimRawStringValue,
} from './strategy-dto.transforms';

export class UpdateStrategyDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimRawStringValue)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(preserveRawValue)
  @IsString()
  description?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_ASSET_TYPES)
  asset_type?: StrategyAssetType;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_TIMEFRAMES)
  timeframe?: StrategyTimeframe;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Allow()
  definition?: StrategyDefinition;
}
