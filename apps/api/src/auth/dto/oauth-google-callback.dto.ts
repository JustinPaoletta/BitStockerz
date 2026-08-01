import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OAuthGoogleCallbackDto {
  @ApiProperty({
    description: 'Short-lived state returned by the start route.',
  })
  @IsString()
  state!: string;

  @ApiProperty({ description: 'Authorization code returned by Google.' })
  @IsString()
  code!: string;

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
}
