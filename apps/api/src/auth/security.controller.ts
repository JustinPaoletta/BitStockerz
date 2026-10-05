import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '../docs/openapi.decorators';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsObject, IsUUID } from 'class-validator';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  AuthGuard,
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from './auth.guard';
import { AuthService } from './auth.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

class EnrollmentDto {
  @IsUUID('4') challenge_id!: string;
  @IsObject() response!: RegistrationResponseJSON;
}

@ApiTags('Account Security')
@Controller('me/security')
@UseGuards(AuthGuard, AuthRateLimitGuard)
export class SecurityController {
  constructor(private readonly auth: AuthService) {}
  private token(request: AuthenticatedRequest): string {
    return request[AUTH_TOKEN_REQUEST_KEY]!;
  }
  @ApiEndpoint({
    summary: 'Get sessions',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('sessions')
  sessions(@Req() request: AuthenticatedRequest) {
    return this.auth.listSessions(this.token(request));
  }
  @ApiEndpoint({
    summary: 'Delete sessions/:id',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Delete('sessions/:id')
  @HttpCode(204)
  revoke(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.auth.revokeSession(this.token(request), id);
  }
  @ApiEndpoint({
    summary: 'Get passkeys',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Get('passkeys')
  passkeys(@Req() request: AuthenticatedRequest) {
    return this.auth.listPasskeys(this.token(request));
  }
  @ApiEndpoint({
    summary: 'Post passkeys/options',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Post('passkeys/options')
  @HttpCode(200)
  options(@Req() request: AuthenticatedRequest) {
    return this.auth.createAdditionalPasskeyOptions(this.token(request));
  }
  @ApiEndpoint({
    summary: 'Post passkeys/verify',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 200,
    errors: [400, 401, 404, 409, 500],
  })
  @Post('passkeys/verify')
  @HttpCode(200)
  verify(@Req() request: AuthenticatedRequest, @Body() body: EnrollmentDto) {
    return this.auth.verifyAdditionalPasskey(
      this.token(request),
      body.challenge_id,
      body.response,
    );
  }
  @ApiEndpoint({
    summary: 'Delete passkeys/:id',
    responseDescription: 'Owner-scoped account security operation.',
    authenticated: true,
    status: 204,
    errors: [400, 401, 404, 409, 500],
  })
  @Delete('passkeys/:id')
  @HttpCode(204)
  remove(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.auth.removePasskey(this.token(request), id);
  }
}
