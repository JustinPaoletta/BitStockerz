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
import { AuditService } from '../observability/audit.service';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AUTH_TOKEN_REQUEST_KEY, AuthGuard } from './auth.guard';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthService } from './auth.service';
import type { AuthResponse } from './auth.service';
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
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    const result = this.authService.register(dto.email, dto.display_name);
    this.auditAuth('auth.register', result);
    return result;
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    const result = this.authService.login(dto.email);
    this.auditAuth('auth.login', result, { method: 'passwordless_dev' });
    return result;
  }

  @Post('webauthn/register/options')
  @UseGuards(AuthRateLimitGuard)
  webauthnRegisterOptions(@Body() dto: WebAuthnRegisterOptionsDto) {
    return this.authService.createWebAuthnRegisterOptions(dto.email);
  }

  @Post('webauthn/register/verify')
  @UseGuards(AuthRateLimitGuard)
  async webauthnRegisterVerify(@Body() dto: WebAuthnRegisterVerifyDto) {
    const result = await this.authService.verifyWebAuthnRegistration({
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
    this.auditAuth('auth.register', result, { method: 'webauthn' });
    return result;
  }

  @Post('webauthn/login/options')
  @UseGuards(AuthRateLimitGuard)
  webauthnLoginOptions(@Body() dto: WebAuthnLoginOptionsDto) {
    return this.authService.createWebAuthnLoginOptions(dto.email);
  }

  @Post('webauthn/login/verify')
  @UseGuards(AuthRateLimitGuard)
  async webauthnLoginVerify(@Body() dto: WebAuthnLoginVerifyDto) {
    const result = await this.authService.verifyWebAuthnLogin({
      email: dto.email,
      challengeId: dto.challenge_id,
      challenge: dto.challenge,
      credentialId: dto.credential_id,
      signCount: dto.sign_count,
      response: dto.response,
    });
    this.auditAuth('auth.login', result, { method: 'webauthn' });
    return result;
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
  async oauthGoogleCallback(@Query() dto: OAuthGoogleCallbackDto) {
    const result = await this.authService.completeGoogleOAuth({
      state: dto.state,
      code: dto.code,
      email: dto.email,
      sub: dto.sub,
    });
    this.auditAuth('auth.login', result, { method: 'oauth_google' });
    return result;
  }

  @Get('oauth/apple/callback')
  async oauthAppleCallbackGet(@Query() dto: OAuthAppleCallbackDto) {
    const result = await this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
    this.auditAuth('auth.login', result, { method: 'oauth_apple' });
    return result;
  }

  @Post('oauth/apple/callback')
  async oauthAppleCallbackPost(@Body() dto: OAuthAppleCallbackDto) {
    const result = await this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
    this.auditAuth('auth.login', result, { method: 'oauth_apple' });
    return result;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Req() request: AuthenticatedRequest) {
    const token = this.getAuthToken(request);
    const user = this.authService.requireUserBySessionToken(token);
    this.authService.logout(token);
    void this.audit.record({
      userId: user.id,
      eventType: 'auth.logout',
      payload: { email: user.email },
    });
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

  private auditAuth(
    eventType: string,
    result: AuthResponse,
    extra: Record<string, unknown> = {},
  ): void {
    void this.audit.record({
      userId: result.user.id,
      eventType,
      payload: {
        email: result.user.email,
        ...extra,
      },
    });
  }
}
