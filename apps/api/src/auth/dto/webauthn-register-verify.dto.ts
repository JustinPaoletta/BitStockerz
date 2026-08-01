import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebAuthnRegisterVerifyDto {
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
    description: 'Legacy local-verification credential public key.',
  })
  @IsOptional()
  @IsString()
  public_key?: string;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Authenticator sign counter.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sign_count?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 10,
    description: 'Authenticator transports reported by the browser.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  transports?: string[];

  @ApiPropertyOptional({ description: 'Authenticator AAGUID.' })
  @IsOptional()
  @IsString()
  aaguid?: string;

  @ApiPropertyOptional({ maxLength: 80, example: 'Ada Trader' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  display_name?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'Browser RegistrationResponseJSON payload.',
  })
  @IsOptional()
  @IsObject()
  response?: Record<string, unknown>;
}
