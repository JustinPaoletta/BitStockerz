import { IsEmail } from 'class-validator';

export class WebAuthnRegisterOptionsDto {
  @IsEmail()
  email!: string;
}
