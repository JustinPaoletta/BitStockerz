import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
export class OAuthSessionExchangeDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  code!: string;

  @ApiProperty({ description: 'Original random browser verifier.' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43,128}$/)
  verifier!: string;
}
