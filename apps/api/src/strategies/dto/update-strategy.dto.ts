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
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStrategyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 255 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimRawStringValue)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ nullable: true, description: 'Use null to clear.' })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @Transform(preserveRawValue)
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ enum: STRATEGY_ASSET_TYPES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_ASSET_TYPES)
  asset_type?: StrategyAssetType;

  @ApiPropertyOptional({ enum: STRATEGY_TIMEFRAMES })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_TIMEFRAMES)
  timeframe?: StrategyTimeframe;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: false,
    description:
      'Canonical strategy definition. Any present valid definition creates a new immutable version.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Allow()
  definition?: StrategyDefinition;
}
