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
  @Transform(trimRawStringValue)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @Transform(preserveRawValue)
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  description?: string;

  @IsIn(STRATEGY_ASSET_TYPES)
  asset_type!: StrategyAssetType;

  @IsIn(STRATEGY_TIMEFRAMES)
  @Validate(StrategyTimeframeCompatibility)
  timeframe!: StrategyTimeframe;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(STRATEGY_SYMBOL_SCOPES)
  symbol_scope?: StrategySymbolScope;

  // The pure schema validator owns all definition shape/content errors so
  // clients receive stable codes and definition-relative field paths.
  @Allow()
  definition!: StrategyDefinition;
}
