import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OAuthGoogleCallbackDto {
  @ApiProperty({
    description: 'Short-lived state returned by the start route.',
  })
  @IsString()
  @MaxLength(128)
  state!: string;

  @ApiPropertyOptional({
    description: 'Authorization code returned by Google.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  code?: string;

  @ApiPropertyOptional({
    format: 'email',
    description:
      'Development fallback identity when OAuth credentials are absent.',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description:
      'Development fallback Google subject when OAuth credentials are absent.',
  })
  @IsOptional()
  @IsString()
  sub?: string;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  authuser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  prompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  hd?: string;
}
