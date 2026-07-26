import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsObject,
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

  @IsDefined()
  @IsObject()
  definition!: StrategyDefinition;
}

function trimRawStringValue(params: TransformFnParams): unknown {
  const candidate = readRawValue(params);
  return typeof candidate === 'string' ? candidate.trim() : candidate;
}

function preserveRawValue(params: TransformFnParams): unknown {
  return readRawValue(params);
}

function readRawValue({ key, obj, value }: TransformFnParams): unknown {
  if (
    typeof key === 'string' &&
    typeof obj === 'object' &&
    obj !== null &&
    Object.prototype.hasOwnProperty.call(obj, key)
  ) {
    return (obj as Record<string, unknown>)[key];
  }

  return value;
}
