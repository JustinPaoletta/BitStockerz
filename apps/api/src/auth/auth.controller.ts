import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AUTH_TOKEN_REQUEST_KEY, AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { OAuthAppleCallbackDto } from './dto/oauth-apple-callback.dto';
import { OAuthGoogleCallbackDto } from './dto/oauth-google-callback.dto';
import { RegisterDto } from './dto/register.dto';
import { WebAuthnLoginOptionsDto } from './dto/webauthn-login-options.dto';
import { WebAuthnLoginVerifyDto } from './dto/webauthn-login-verify.dto';
import { WebAuthnRegisterOptionsDto } from './dto/webauthn-register-options.dto';
import { WebAuthnRegisterVerifyDto } from './dto/webauthn-register-verify.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.display_name);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email);
  }

  @Post('webauthn/register/options')
  @UseGuards(AuthRateLimitGuard)
  webauthnRegisterOptions(@Body() dto: WebAuthnRegisterOptionsDto) {
    return this.authService.createWebAuthnRegisterOptions(dto.email);
  }

  @Post('webauthn/register/verify')
  @UseGuards(AuthRateLimitGuard)
  webauthnRegisterVerify(@Body() dto: WebAuthnRegisterVerifyDto) {
    return this.authService.verifyWebAuthnRegistration({
      email: dto.email,
      challengeId: dto.challenge_id,
      challenge: dto.challenge,
      credentialId: dto.credential_id,
      publicKey: dto.public_key,
      signCount: dto.sign_count,
      transports: dto.transports,
      aaguid: dto.aaguid,
      displayName: dto.display_name,
      response: dto.response,
    });
  }

  @Post('webauthn/login/options')
  @UseGuards(AuthRateLimitGuard)
  webauthnLoginOptions(@Body() dto: WebAuthnLoginOptionsDto) {
    return this.authService.createWebAuthnLoginOptions(dto.email);
  }

  @Post('webauthn/login/verify')
  @UseGuards(AuthRateLimitGuard)
  webauthnLoginVerify(@Body() dto: WebAuthnLoginVerifyDto) {
    return this.authService.verifyWebAuthnLogin({
      email: dto.email,
      challengeId: dto.challenge_id,
      challenge: dto.challenge,
      credentialId: dto.credential_id,
      signCount: dto.sign_count,
      response: dto.response,
    });
  }

  @Get('oauth/google/start')
  @UseGuards(AuthRateLimitGuard)
  oauthGoogleStart() {
    return this.authService.createOAuthStart('google');
  }

  @Get('oauth/apple/start')
  @UseGuards(AuthRateLimitGuard)
  oauthAppleStart() {
    return this.authService.createOAuthStart('apple');
  }

  @Get('oauth/google/callback')
  oauthGoogleCallback(@Query() dto: OAuthGoogleCallbackDto) {
    return this.authService.completeGoogleOAuth({
      state: dto.state,
      code: dto.code,
      email: dto.email,
      sub: dto.sub,
    });
  }

  @Get('oauth/apple/callback')
  oauthAppleCallbackGet(@Query() dto: OAuthAppleCallbackDto) {
    return this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
  }

  @Post('oauth/apple/callback')
  oauthAppleCallbackPost(@Body() dto: OAuthAppleCallbackDto) {
    return this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthenticatedRequest) {
    this.authService.logout(this.getAuthToken(request));
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfileBySessionToken(
      this.getAuthToken(request),
    );
  }

  private getAuthToken(request: AuthenticatedRequest): string {
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
    return token;
  }
}
