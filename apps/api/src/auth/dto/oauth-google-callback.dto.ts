import { IsEmail, IsOptional, IsString } from 'class-validator';

export class OAuthGoogleCallbackDto {
  @IsString()
  state!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  sub?: string;
}
