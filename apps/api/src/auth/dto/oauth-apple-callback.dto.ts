import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OAuthAppleCallbackDto {
  @ApiProperty({
    description: 'Short-lived state returned by the start route.',
  })
  @IsString()
  @MaxLength(128)
  state!: string;

  @ApiPropertyOptional({ description: 'Authorization code returned by Apple.' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @ApiPropertyOptional({ description: 'Development Apple subject identifier.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  sub?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Apple form-post user JSON supplied on first authorization.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  user?: string;
  @ApiPropertyOptional({
    description: 'Provider cancellation/error identifier.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  error_description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  error_uri?: string;
}
