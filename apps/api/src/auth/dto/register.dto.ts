import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'trader@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    maxLength: 80,
    example: 'Ada Trader',
    description: 'Optional display name; surrounding whitespace is normalized.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  display_name?: string;
}
