import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebAuthnLoginOptionsDto {
  @ApiProperty({ format: 'email', example: 'trader@example.com' })
  @IsEmail()
  email!: string;
}
