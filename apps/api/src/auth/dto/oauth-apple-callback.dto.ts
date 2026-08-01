import { IsEmail, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OAuthAppleCallbackDto {
  @ApiProperty({
    description: 'Short-lived state returned by the start route.',
  })
  @IsString()
  state!: string;

  @ApiProperty({ description: 'Authorization code returned by Apple.' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'Apple subject identifier.' })
  @IsString()
  sub!: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'Apple form-post user JSON supplied on first authorization.',
  })
  @IsOptional()
  @IsString()
  user?: string;
}
