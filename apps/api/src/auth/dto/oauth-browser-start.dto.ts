import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
export class OAuthBrowserStartDto {
  @ApiProperty({ description: 'Base64url SHA-256 browser verifier challenge.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  code_challenge!: string;

  @ApiProperty({ example: '/dashboard' })
  @IsString()
  @MaxLength(2048)
  return_path!: string;
}
