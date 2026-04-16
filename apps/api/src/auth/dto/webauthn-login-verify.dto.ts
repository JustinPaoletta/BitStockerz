import { IsEmail, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class WebAuthnLoginVerifyDto {
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
  @IsInt()
  @Min(0)
  sign_count?: number;

  @IsOptional()
  @IsObject()
  response?: Record<string, unknown>;
}
