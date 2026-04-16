import { IsEmail } from 'class-validator';

export class WebAuthnLoginOptionsDto {
  @IsEmail()
  email!: string;
}
