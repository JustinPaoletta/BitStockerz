import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AssetType } from '../market-data.types';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SymbolSearchQueryDto {
  @ApiPropertyOptional({
    example: 'apple',
    description: 'Case-insensitive symbol or display-name search text.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  q?: string;

  @ApiPropertyOptional({ enum: ['EQUITY', 'CRYPTO'] })
  @IsOptional()
  @IsIn(['EQUITY', 'CRYPTO'])
  asset_type?: AssetType;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
