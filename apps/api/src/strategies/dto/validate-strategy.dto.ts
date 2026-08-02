import { Transform } from 'class-transformer';
import { Allow, IsUUID, ValidateIf } from 'class-validator';
import type { StrategyDefinition } from '../strategy.types';
import { preserveRawValue } from './strategy-dto.transforms';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ValidateStrategyDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: false,
    description:
      'Inline canonical definition. Exactly one input must be supplied.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Allow()
  definition?: StrategyDefinition;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Owned strategy to validate. Exactly one input must be supplied.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(preserveRawValue)
  @IsUUID('4')
  strategy_id?: string;
}
