import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetStrategyQueryDto {
  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    description: 'Immutable version number. Omit to read the latest version.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  version?: number;
}
