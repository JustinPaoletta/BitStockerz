import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 80, example: 'Ada Trader' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  display_name?: string;

  @ApiPropertyOptional({
    enum: ['USD'],
    description: 'USD is the only supported base currency in the current MVP.',
  })
  @IsOptional()
  @IsIn(['USD'])
  base_currency?: 'USD';
}
