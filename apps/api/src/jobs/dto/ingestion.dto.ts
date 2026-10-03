import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class EquityIngestionDto {
  @ApiPropertyOptional({ example: 'AAPL', maxLength: 32 })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }): unknown =>
    typeof obj.symbol === 'string'
      ? obj.symbol.trim().toUpperCase()
      : obj.symbol,
  )
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9.-]{0,31}$/)
  symbol?: string;
}

export class CryptoIngestionDto extends EquityIngestionDto {
  @ApiPropertyOptional({
    type: [String],
    enum: ['1d', '1h'],
    minItems: 1,
    maxItems: 2,
    uniqueItems: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ArrayUnique()
  @IsIn(['1d', '1h'], { each: true })
  intervals?: Array<'1d' | '1h'>;
}
