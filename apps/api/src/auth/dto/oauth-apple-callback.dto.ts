import { IsEmail, IsOptional, IsString } from 'class-validator';

export class OAuthAppleCallbackDto {
  @IsString()
  state!: string;

  @IsString()
  code!: string;

  @IsString()
  sub!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  user?: string;
}
