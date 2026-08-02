import { Transform } from 'class-transformer';
import {
  Allow,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import {
  STRATEGY_ASSET_TYPES,
  STRATEGY_SYMBOL_SCOPES,
  STRATEGY_TIMEFRAMES,
  type StrategyAssetType,
  type StrategyDefinition,
  type StrategySymbolScope,
  type StrategyTimeframe,
} from '../strategy.types';
import {
  preserveRawValue,
  trimRawStringValue,
} from './strategy-dto.transforms';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'strategyTimeframeCompatibility', async: false })
export class StrategyTimeframeCompatibility implements ValidatorConstraintInterface {
  validate(
    timeframe: unknown,
    validationArguments: ValidationArguments,
  ): boolean {
    const dto = validationArguments.object as CreateStrategyDto;
    return dto.asset_type !== 'EQUITY' || timeframe === '1d';
  }

  defaultMessage(): string {
    return 'timeframe must be 1d when asset_type is EQUITY';
  }
}

export class CreateStrategyDto {
  @ApiProperty({ minLength: 1, maxLength: 255, example: 'SMA momentum' })
  @Transform(trimRawStringValue)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'Daily trend-following strategy.' })
  @Transform(preserveRawValue)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  description?: string;

  @ApiProperty({ enum: STRATEGY_ASSET_TYPES })
  @IsIn(STRATEGY_ASSET_TYPES)
  asset_type!: StrategyAssetType;

  @ApiProperty({
    enum: STRATEGY_TIMEFRAMES,
    description: 'Equity strategies currently support only 1d.',
  })
  @IsIn(STRATEGY_TIMEFRAMES)
  @Validate(StrategyTimeframeCompatibility)
  timeframe!: StrategyTimeframe;

  @ApiPropertyOptional({ enum: STRATEGY_SYMBOL_SCOPES, default: 'SINGLE' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_SYMBOL_SCOPES)
  symbol_scope?: StrategySymbolScope;

  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    description: 'Canonical strategy definition; see StrategyDefinition.',
  })
  // The pure schema validator owns all definition shape/content errors so
  // clients receive stable codes and definition-relative field paths.
  @Allow()
  definition!: StrategyDefinition;
}
