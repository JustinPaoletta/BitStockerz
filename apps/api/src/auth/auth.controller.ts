import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Res,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { OAuthBrowserStartDto } from './dto/oauth-browser-start.dto';
import { OAuthSessionExchangeDto } from './dto/oauth-session-exchange.dto';
import { extractBearerToken } from './auth.guard';
import type { OauthProvider } from './auth.records';
import { ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuditService } from '../observability/audit.service';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
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

const BROWSER_CALLBACK_RESPONSE = {
  status: 303,
  description:
    'Browser flow redirects to the configured SPA callback with a one-use handoff or bounded error. No bearer token appears in the URL.',
  headers: {
    Location: {
      description: 'Configured SPA callback URL.',
      schema: { type: 'string' },
    },
    'x-request-id': {
      description: 'Request correlation id.',
      schema: { type: 'string' },
    },
  },
};

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Register a development user',
    description:
      'Development/testing shortcut when AUTH_DEV_EMAIL_ENABLED=true. Creates a user and opaque bearer session. Disabled in production.',
    status: 201,
    responseDescription: 'User and bearer session created.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 409, 500],
  })
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto.email, dto.display_name);
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.register', result);
    return result;
  }

  @Post('login')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Log in by email in development',
    description:
      'Development/testing shortcut when AUTH_DEV_EMAIL_ENABLED=true. Issues an opaque bearer session for an existing user. Disabled in production.',
    status: 201,
    responseDescription: 'Bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 401, 404, 429, 500],
  })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto.email);
    this.auditAuth('auth.login', result, { method: 'passwordless_dev' });
    return result;
  }

  @Post('webauthn/register/options')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin passkey registration',
    status: 201,
    responseDescription: 'WebAuthn registration challenge and browser options.',
    responseSchema: apiSchemaRef('WebAuthnRegisterOptions'),
    errors: [400, 429, 500],
  })
  webauthnRegisterOptions(@Body() dto: WebAuthnRegisterOptionsDto) {
    return this.authService.createWebAuthnRegisterOptions(dto.email);
  }

  @Post('webauthn/register/verify')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Verify passkey registration',
    description:
      'Accepts a browser WebAuthn registration response. Legacy primitive fields remain available for local compatibility.',
    status: 201,
    responseDescription: 'Passkey registered and bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 409, 429, 500],
  })
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
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.register', result, { method: 'webauthn' });
    return result;
  }

  @Post('webauthn/login/options')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin passkey login',
    status: 201,
    responseDescription:
      'WebAuthn authentication challenge and browser options.',
    responseSchema: apiSchemaRef('WebAuthnLoginOptions'),
    errors: [400, 404, 429, 500],
  })
  webauthnLoginOptions(@Body() dto: WebAuthnLoginOptionsDto) {
    return this.authService.createWebAuthnLoginOptions(dto.email);
  }

  @Post('webauthn/login/verify')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Verify passkey login',
    description:
      'Accepts a browser WebAuthn authentication response and advances the credential sign counter.',
    status: 201,
    responseDescription: 'Passkey verified and bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 401, 404, 409, 429, 500],
  })
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

  @Get('providers')
  @ApiEndpoint({
    summary: 'Read configured browser identity providers',
    responseSchema: apiSchemaRef('OAuthProviders'),
    responseDescription: 'Provider availability.',
  })
  providers() {
    return this.authService.getOAuthProviders();
  }

  @Post('oauth/:provider/browser/start')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin browser OAuth login',
    status: 201,
    responseSchema: apiSchemaRef('OAuthStartResponse'),
    responseDescription: 'Provider redirect and browser state.',
    errors: [400, 429, 500],
  })
  oauthBrowserStart(
    @Param('provider') provider: string,
    @Body() dto: OAuthBrowserStartDto,
  ) {
    return this.authService.createOAuthBrowserStart(
      this.requireProvider(provider),
      dto,
    );
  }

  @Post('oauth/:provider/link/start')
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin linking a recovery provider after recent sign-in',
    authenticated: true,
    status: 201,
    responseSchema: apiSchemaRef('OAuthStartResponse'),
    responseDescription:
      'Provider redirect bound to original user and session.',
    errors: [400, 401, 429, 500],
  })
  oauthLinkStart(
    @Param('provider') provider: string,
    @Body() dto: OAuthBrowserStartDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.authService.createOAuthBrowserStart(
      this.requireProvider(provider),
      dto,
      this.getAuthToken(request),
    );
  }

  @Post('oauth/session/exchange')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Redeem a one-use browser OAuth handoff',
    status: 201,
    responseSchema: apiSchemaRef('OAuthSessionExchangeResponse'),
    responseDescription:
      'Bearer session and validated local destination; linking requires original bearer.',
    errors: [400, 401, 409, 429, 500],
  })
  async oauthSessionExchange(
    @Body() dto: OAuthSessionExchangeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const result = await this.authService.exchangeOAuthSession(
      dto,
      extractBearerToken(request.headers.authorization),
    );
    this.auditAuth(
      result.intent === 'link' ? 'auth.provider_linked' : 'auth.login',
      result,
      { method: 'oauth' },
    );
    return result;
  }

  private requireProvider(provider: string): OauthProvider {
    if (provider !== 'google' && provider !== 'apple')
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Unsupported provider.',
      );
    return provider;
  }

  @Get('oauth/google/start')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin Google OAuth',
    responseDescription: 'Provider authorization URL and short-lived state.',
    responseSchema: apiSchemaRef('OAuthStartResponse'),
    errors: [429, 500],
  })
  oauthGoogleStart() {
    return this.authService.createOAuthStart('google');
  }

  @Get('oauth/apple/start')
  @UseGuards(AuthRateLimitGuard)
  @ApiEndpoint({
    summary: 'Begin Apple OAuth',
    responseDescription: 'Provider authorization URL and short-lived state.',
    responseSchema: apiSchemaRef('OAuthStartResponse'),
    errors: [429, 500],
  })
  oauthAppleStart() {
    return this.authService.createOAuthStart('apple');
  }

  @Get('oauth/google/callback')
  @UseGuards(AuthRateLimitGuard)
  @ApiResponse(BROWSER_CALLBACK_RESPONSE)
  @ApiEndpoint({
    summary: 'Complete Google OAuth',
    description:
      'Exchanges a provider authorization code when credentials are configured. Development fallback identity fields are supported only by local configuration.',
    responseDescription: 'OAuth identity linked and bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 401, 409, 500],
  })
  async oauthGoogleCallback(
    @Query() dto: OAuthGoogleCallbackDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    if (response)
      return this.completeHttpOAuthCallback('google', dto, response);
    const result = await this.authService.completeGoogleOAuth({
      state: dto.state,
      code: dto.code,
      email: dto.email,
      sub: dto.sub,
    });
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.login', result, { method: 'oauth_google' });
    return result;
  }

  @Get('oauth/apple/callback')
  @UseGuards(AuthRateLimitGuard)
  @ApiResponse(BROWSER_CALLBACK_RESPONSE)
  @ApiEndpoint({
    summary: 'Complete Apple OAuth by query callback',
    responseDescription: 'OAuth identity linked and bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 401, 409, 500],
  })
  async oauthAppleCallbackGet(
    @Query() dto: OAuthAppleCallbackDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    if (response) return this.completeHttpOAuthCallback('apple', dto, response);
    const result = await this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.login', result, { method: 'oauth_apple' });
    return result;
  }

  @Post('oauth/apple/callback')
  @UseGuards(AuthRateLimitGuard)
  @ApiResponse(BROWSER_CALLBACK_RESPONSE)
  @ApiConsumes('application/x-www-form-urlencoded', 'application/json')
  @ApiEndpoint({
    summary: 'Complete Apple OAuth form-post callback',
    status: 201,
    responseDescription: 'OAuth identity linked and bearer session issued.',
    responseSchema: apiSchemaRef('AuthResponse'),
    errors: [400, 401, 409, 500],
  })
  async oauthAppleCallbackPost(
    @Body() dto: OAuthAppleCallbackDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    if (response) return this.completeHttpOAuthCallback('apple', dto, response);
    const result = await this.authService.completeAppleOAuth({
      state: dto.state,
      code: dto.code,
      sub: dto.sub,
      email: dto.email,
      user: dto.user,
    });
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.login', result, { method: 'oauth_apple' });
    return result;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @ApiEndpoint({
    summary: 'Log out the current session',
    status: 201,
    authenticated: true,
    responseDescription: 'Bearer session invalidated.',
    responseSchema: apiSchemaRef('LogoutResponse'),
    errors: [401, 500],
  })
  async logout(@Req() request: AuthenticatedRequest) {
    const token = this.getAuthToken(request);
    const user = this.authService.requireUserBySessionToken(token);
    await this.authService.logout(token);
    void this.audit.record({
      userId: user.id,
      eventType: 'auth.logout',
      payload: { email: user.email },
    });
    return { status: 'ok' };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiEndpoint({
    summary: 'Read the authenticated profile',
    authenticated: true,
    responseDescription:
      'Current user profile and linked authentication methods.',
    responseSchema: apiSchemaRef('UserProfile'),
    errors: [401, 500],
  })
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getProfileBySessionToken(
      this.getAuthToken(request),
    );
  }

  private async completeHttpOAuthCallback(
    provider: OauthProvider,
    dto: OAuthGoogleCallbackDto | OAuthAppleCallbackDto,
    response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const result = await this.authService.handleOAuthCallback(provider, dto);
    if ('redirect_url' in result) {
      response.redirect(303, result.redirect_url);
      return;
    }
    await this.authService.ensurePaperAccountForUser(result.user.id);
    this.auditAuth('auth.login', result, { method: `oauth_${provider}` });
    return result;
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
