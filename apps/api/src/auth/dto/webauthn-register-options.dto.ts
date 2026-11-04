import { IsEmail, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebAuthnRegisterOptionsDto {
  @ApiProperty({ format: 'email', example: 'trader@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({
    description:
      'Private mobile beta enrollment token. Never put this token in a URL.',
  })
  @IsOptional()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  invitation_token?: string;
}
