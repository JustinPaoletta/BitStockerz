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

export class WebAuthnRegisterVerifyDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  challenge_id?: string;

  @IsOptional()
  @IsString()
  challenge?: string;

  @IsOptional()
  @IsString()
  credential_id?: string;

  @IsOptional()
  @IsString()
  public_key?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sign_count?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  transports?: string[];

  @IsOptional()
  @IsString()
  aaguid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  display_name?: string;

  @IsOptional()
  @IsObject()
  response?: Record<string, unknown>;
}
