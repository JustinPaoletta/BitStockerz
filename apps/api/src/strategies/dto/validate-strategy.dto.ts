import { Transform } from 'class-transformer';
import { Allow, IsUUID, ValidateIf } from 'class-validator';
import type { StrategyDefinition } from '../strategy.types';
import { preserveRawValue } from './strategy-dto.transforms';

export class ValidateStrategyDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Allow()
  definition?: StrategyDefinition;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(preserveRawValue)
  @IsUUID('4')
  strategy_id?: string;
}
