import {
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebAuthnLoginVerifyDto {
  @ApiProperty({ format: 'email', example: 'trader@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Challenge record identifier.' })
  @IsOptional()
  @IsString()
  challenge_id?: string;

  @ApiPropertyOptional({
    description: 'Legacy local-verification challenge field.',
  })
  @IsOptional()
  @IsString()
  challenge?: string;

  @ApiPropertyOptional({ description: 'Base64url WebAuthn credential ID.' })
  @IsOptional()
  @IsString()
  credential_id?: string;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Authenticator sign counter.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sign_count?: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Browser AuthenticationResponseJSON payload.',
  })
  @IsOptional()
  @IsObject()
  response?: Record<string, unknown>;
}
