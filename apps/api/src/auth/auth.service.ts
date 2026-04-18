import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  type WebAuthnCredential,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { JWTPayload } from 'jose';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUTHORIZATION_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export type BaseCurrency = 'USD';
export type OauthProvider = 'google' | 'apple';

type WebAuthnChallengePurpose = 'register' | 'login';

export interface LinkedAuthMethods {
  passkeys: boolean;
  google: boolean;
  apple: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name?: string;
  base_currency: BaseCurrency;
  linked_auth_methods: LinkedAuthMethods;
  passkey_count: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  user: UserProfile;
}

export interface WebAuthnRegisterOptionsResponse {
  challenge_id: string;
  challenge: string;
  rp_id: string;
  rp_name: string;
  timeout_ms: number;
  user_email: string;
  options: unknown;
}

export interface WebAuthnLoginOptionsResponse {
  challenge_id: string;
  challenge: string;
  timeout_ms: number;
  user_email: string;
  allow_credentials: string[];
  options: unknown;
}

export interface OAuthStartResponse {
  provider: OauthProvider;
  state: string;
  authorization_url: string;
  expires_in_seconds: number;
}

export interface WebAuthnRegistrationVerifyInput {
  email: string;
  challengeId?: string;
  challenge?: string;
  credentialId?: string;
  publicKey?: string;
  signCount?: number;
  transports?: string[];
  aaguid?: string;
  displayName?: string;
  response?: Record<string, unknown>;
}

export interface WebAuthnLoginVerifyInput {
  email: string;
  challengeId?: string;
  challenge?: string;
  credentialId?: string;
  signCount?: number;
  response?: Record<string, unknown>;
}

export interface GoogleOAuthCallbackInput {
  state: string;
  code: string;
  email?: string;
  sub?: string;
}

export interface AppleOAuthCallbackInput {
  state: string;
  code: string;
  sub?: string;
  email?: string;
  user?: string;
}

interface ProfileUpdate {
  display_name?: string;
  base_currency?: BaseCurrency;
}

interface UserRecord {
  id: string;
  email: string;
  display_name?: string;
  base_currency: BaseCurrency;
  passkeyCredentialIds: Set<string>;
  googleSubject?: string;
  appleSubject?: string;
}

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

interface PasskeyCredentialRecord {
  credentialId: string;
  userId: string;
  credential: WebAuthnCredential;
  aaguid?: string;
  createdAt: string;
}

interface WebAuthnChallengeRecord {
  challengeId: string;
  purpose: WebAuthnChallengePurpose;
  email: string;
  challenge: string;
  expiresAt: number;
}

interface OauthStateRecord {
  state: string;
  provider: OauthProvider;
  nonce: string;
  expiresAt: number;
}

interface OAuthIdentity {
  subject: string;
  email?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(displayName: string | undefined): string | undefined {
  if (displayName === undefined) {
    return undefined;
  }

  const normalized = displayName.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function createRandomToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}

function normalizePrivateKey(input: string): string {
  return input.replace(/\\n/g, '\n');
}

function toTransports(values: string[] | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return values
    .map((value) => value.trim())
    .filter((value): value is AuthenticatorTransportFuture => {
      return ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(value);
    });
}

@Injectable()
export class AuthService {
  private readonly usersByEmail = new Map<string, UserRecord>();
  private readonly usersById = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly credentialsById = new Map<string, PasskeyCredentialRecord>();
  private readonly webAuthnChallengesById = new Map<string, WebAuthnChallengeRecord>();
  private readonly oauthStatesById = new Map<string, OauthStateRecord>();
  private readonly googleSubjectsToUserIds = new Map<string, string>();
  private readonly appleSubjectsToUserIds = new Map<string, string>();
  private googleJwks?: ReturnType<(typeof import('jose'))['createRemoteJWKSet']>;
  private appleJwks?: ReturnType<(typeof import('jose'))['createRemoteJWKSet']>;

  constructor(private readonly config: AppConfigService) {}

  register(email: string, displayName?: string): AuthResponse {
    const normalizedEmail = normalizeEmail(email);
    const user = this.createUser(normalizedEmail, displayName);

    // Backward-compatible placeholder for the legacy /auth/register endpoint.
    this.addPasskeyCredential(user, {
      credentialId: `legacy-${randomUUID()}`,
      credential: {
        id: `legacy-${randomUUID()}`,
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 1,
        transports: ['internal'],
      },
      aaguid: 'legacy',
    });

    return this.createAuthResponse(user);
  }

  login(email: string): AuthResponse {
    const normalizedEmail = normalizeEmail(email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Invalid email or authentication method.');
    }

    return this.createAuthResponse(user);
  }

  async createWebAuthnRegisterOptions(email: string): Promise<WebAuthnRegisterOptionsResponse> {
    const normalizedEmail = normalizeEmail(email);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Email is already registered.');
    }

    const challenge = this.createWebAuthnChallenge('register', normalizedEmail);

    const options = await generateRegistrationOptions({
      rpName: this.config.auth.webauthnRpName,
      rpID: this.config.auth.webauthnRpId,
      userName: normalizedEmail,
      userID: new TextEncoder().encode(normalizedEmail),
      userDisplayName: normalizedEmail,
      challenge: challenge.challenge,
      timeout: this.config.auth.challengeTtlSeconds * 1000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    return {
      challenge_id: challenge.challengeId,
      challenge: challenge.challenge,
      rp_id: this.config.auth.webauthnRpId,
      rp_name: this.config.auth.webauthnRpName,
      timeout_ms: this.config.auth.challengeTtlSeconds * 1000,
      user_email: normalizedEmail,
      options,
    };
  }

  async verifyWebAuthnRegistration(input: WebAuthnRegistrationVerifyInput): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Email is already registered.');
    }

    const challengeId = normalizeOptional(input.challengeId);
    if (!challengeId) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'challenge_id is required.');
    }

    const challenge = this.consumeWebAuthnChallenge(challengeId, 'register', normalizedEmail);

    const user = this.createUser(normalizedEmail, input.displayName);

    if (input.response) {
      const registrationResponse = input.response as unknown as RegistrationResponseJSON;
      const verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.getExpectedWebAuthnOrigins(),
        expectedRPID: this.config.auth.webauthnRpId,
        requireUserVerification: true,
      });

      if (!verification.verified || !verification.registrationInfo) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey registration verification failed.');
      }

      this.addPasskeyCredential(user, {
        credentialId: verification.registrationInfo.credential.id,
        credential: {
          id: verification.registrationInfo.credential.id,
          publicKey: verification.registrationInfo.credential.publicKey,
          counter: verification.registrationInfo.credential.counter,
          transports: verification.registrationInfo.credential.transports,
        },
        aaguid: verification.registrationInfo.aaguid,
      });
    } else {
      // Compatibility fallback for local/test requests that don't send a full WebAuthn response payload.
      this.verifyLegacyWebAuthnRegistration(user, challenge, input);
    }

    return this.createAuthResponse(user);
  }

  async createWebAuthnLoginOptions(email: string): Promise<WebAuthnLoginOptionsResponse> {
    const normalizedEmail = normalizeEmail(email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user || user.passkeyCredentialIds.size === 0) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'No passkey account found for this email.');
    }

    const challenge = this.createWebAuthnChallenge('login', normalizedEmail);

    const options = await generateAuthenticationOptions({
      rpID: this.config.auth.webauthnRpId,
      challenge: challenge.challenge,
      timeout: this.config.auth.challengeTtlSeconds * 1000,
      userVerification: 'preferred',
      allowCredentials: [...user.passkeyCredentialIds]
        .map((credentialId) => this.credentialsById.get(credentialId))
        .filter((credential): credential is PasskeyCredentialRecord => Boolean(credential))
        .map((credential) => ({
          id: credential.credential.id,
          transports: credential.credential.transports,
        })),
    });

    return {
      challenge_id: challenge.challengeId,
      challenge: challenge.challenge,
      timeout_ms: this.config.auth.challengeTtlSeconds * 1000,
      user_email: normalizedEmail,
      allow_credentials: options.allowCredentials?.map((credential) => credential.id) ?? [],
      options,
    };
  }

  async verifyWebAuthnLogin(input: WebAuthnLoginVerifyInput): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Invalid email or authentication method.');
    }

    const challengeId = normalizeOptional(input.challengeId);
    if (!challengeId) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'challenge_id is required.');
    }

    const challenge = this.consumeWebAuthnChallenge(challengeId, 'login', normalizedEmail);

    if (input.response) {
      const authenticationResponse = input.response as unknown as AuthenticationResponseJSON;
      const credentialId = normalizeOptional(authenticationResponse.id);
      if (!credentialId) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey credential is missing from authentication response.');
      }

      const credential = this.credentialsById.get(credentialId);
      if (!credential || credential.userId !== user.id) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey credential does not match this account.');
      }

      const verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.getExpectedWebAuthnOrigins(),
        expectedRPID: this.config.auth.webauthnRpId,
        credential: credential.credential,
        requireUserVerification: true,
      });

      if (!verification.verified) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey authentication verification failed.');
      }

      credential.credential.counter = verification.authenticationInfo.newCounter;
    } else {
      this.verifyLegacyWebAuthnLogin(user, input);
    }

    return this.createAuthResponse(user);
  }

  createOAuthStart(provider: OauthProvider): OAuthStartResponse {
    this.pruneExpiredOauthStates();

    const state = createRandomToken();
    const nonce = createRandomToken();
    const ttlSeconds = this.config.auth.oauthStateTtlSeconds;
    const expiresAt = Date.now() + ttlSeconds * 1000;

    this.oauthStatesById.set(state, {
      state,
      provider,
      nonce,
      expiresAt,
    });

    return {
      provider,
      state,
      authorization_url: this.buildOAuthAuthorizationUrl(provider, state, nonce),
      expires_in_seconds: ttlSeconds,
    };
  }

  async completeGoogleOAuth(input: GoogleOAuthCallbackInput): Promise<AuthResponse> {
    const state = this.consumeOauthState(input.state, 'google');
    const identity = await this.resolveGoogleIdentity(input, state);

    const mappedUserId = this.googleSubjectsToUserIds.get(identity.subject);
    const emailUser = identity.email ? this.usersByEmail.get(identity.email) : undefined;

    if (mappedUserId && emailUser && mappedUserId !== emailUser.id) {
      throw new DomainError(ErrorCode.CONFLICT, 'Google account is already linked to a different user.');
    }

    const user = mappedUserId
      ? this.requireUserById(mappedUserId)
      : emailUser ?? this.createUser(identity.email ?? `${identity.subject}@google.private`);

    this.linkGoogleSubject(user, identity.subject);
    return this.createAuthResponse(user);
  }

  async completeAppleOAuth(input: AppleOAuthCallbackInput): Promise<AuthResponse> {
    const state = this.consumeOauthState(input.state, 'apple');
    const identity = await this.resolveAppleIdentity(input, state);

    const mappedUserId = this.appleSubjectsToUserIds.get(identity.subject);
    if (mappedUserId) {
      const user = this.requireUserById(mappedUserId);
      if (identity.email) {
        const emailUser = this.usersByEmail.get(identity.email);
        if (emailUser && emailUser.id !== user.id) {
          throw new DomainError(ErrorCode.CONFLICT, 'Apple account is already linked to a different user.');
        }
      }
      this.linkAppleSubject(user, identity.subject);
      return this.createAuthResponse(user);
    }

    const user = identity.email
      ? this.usersByEmail.get(identity.email) ?? this.createUser(identity.email)
      : this.createUser(`${identity.subject}@apple.private`);

    this.linkAppleSubject(user, identity.subject);
    return this.createAuthResponse(user);
  }

  logout(sessionToken: string): void {
    const deleted = this.sessions.delete(sessionToken);
    if (!deleted) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
  }

  getProfileBySessionToken(sessionToken: string): UserProfile {
    return this.toUserProfile(this.requireUserBySessionToken(sessionToken));
  }

  updateProfileBySessionToken(sessionToken: string, update: ProfileUpdate): UserProfile {
    const user = this.requireUserBySessionToken(sessionToken);

    if (update.display_name !== undefined) {
      user.display_name = normalizeDisplayName(update.display_name);
    }

    if (update.base_currency !== undefined) {
      user.base_currency = update.base_currency;
    }

    return this.toUserProfile(user);
  }

  requireUserBySessionToken(sessionToken: string): UserRecord {
    this.pruneExpiredSessions();

    const session = this.sessions.get(sessionToken);
    if (!session) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionToken);
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Session has expired.');
    }

    return this.requireUserById(session.userId);
  }

  private verifyLegacyWebAuthnRegistration(
    user: UserRecord,
    challenge: WebAuthnChallengeRecord,
    input: WebAuthnRegistrationVerifyInput,
  ): void {
    const challengeResponse = normalizeOptional(input.challenge);
    const credentialId = normalizeOptional(input.credentialId);
    const publicKey = normalizeOptional(input.publicKey);

    if (!challengeResponse || challengeResponse !== challenge.challenge || !credentialId || !publicKey) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'WebAuthn challenge verification failed.');
    }

    const signCount = input.signCount ?? 0;
    if (signCount < 0) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'sign_count must be >= 0.');
    }

    this.addPasskeyCredential(user, {
      credentialId,
      credential: {
        id: credentialId,
        publicKey: new TextEncoder().encode(publicKey),
        counter: signCount,
        transports: toTransports(input.transports),
      },
      aaguid: input.aaguid,
    });
  }

  private verifyLegacyWebAuthnLogin(user: UserRecord, input: WebAuthnLoginVerifyInput): void {
    const credentialId = normalizeOptional(input.credentialId);
    if (!credentialId || !user.passkeyCredentialIds.has(credentialId)) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey credential does not match this account.');
    }

    const credential = this.credentialsById.get(credentialId);
    if (!credential) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey credential does not match this account.');
    }

    const signCount = input.signCount;
    if (signCount === undefined || signCount <= credential.credential.counter) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Passkey assertion failed counter validation.');
    }

    credential.credential.counter = signCount;
  }

  private getExpectedWebAuthnOrigins(): string[] {
    if (this.config.auth.webauthnAllowedOrigins.length > 0) {
      return this.config.auth.webauthnAllowedOrigins;
    }

    if (this.config.server.nodeEnv === 'production') {
      throw new DomainError(
        ErrorCode.INTERNAL_ERROR,
        'WEBAUTHN_ALLOWED_ORIGINS must be configured before enabling WebAuthn in production.',
      );
    }

    return ['http://localhost:3000', 'http://localhost:4200'];
  }

  private isGoogleConfigured(): boolean {
    return Boolean(
      this.config.auth.googleClientId &&
        this.config.auth.googleClientSecret &&
        this.config.auth.googleRedirectUri,
    );
  }

  private isAppleConfigured(): boolean {
    return Boolean(
      this.config.auth.appleClientId &&
        this.config.auth.appleTeamId &&
        this.config.auth.appleKeyId &&
        this.config.auth.applePrivateKey &&
        this.config.auth.appleRedirectUri,
    );
  }

  private canUseDevFallback(): boolean {
    return this.config.server.nodeEnv !== 'production';
  }

  private buildOAuthAuthorizationUrl(provider: OauthProvider, state: string, nonce: string): string {
    if (provider === 'google') {
      if (this.isGoogleConfigured()) {
        const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
        url.searchParams.set('client_id', this.config.auth.googleClientId as string);
        url.searchParams.set('redirect_uri', this.config.auth.googleRedirectUri as string);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'openid email profile');
        url.searchParams.set('state', state);
        url.searchParams.set('nonce', nonce);
        url.searchParams.set('prompt', 'select_account');
        return url.toString();
      }

      if (this.canUseDevFallback()) {
        return `/api/auth/oauth/google/callback?state=${state}&code=dev-code&email=user@example.com&sub=google-dev-sub`;
      }

      throw new DomainError(
        ErrorCode.INTERNAL_ERROR,
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI.',
      );
    }

    if (this.isAppleConfigured()) {
      const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);
      url.searchParams.set('client_id', this.config.auth.appleClientId as string);
      url.searchParams.set('redirect_uri', this.config.auth.appleRedirectUri as string);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('response_mode', 'form_post');
      url.searchParams.set('scope', 'name email');
      url.searchParams.set('state', state);
      url.searchParams.set('nonce', nonce);
      return url.toString();
    }

    if (this.canUseDevFallback()) {
      return `/api/auth/oauth/apple/callback?state=${state}&code=dev-code&sub=apple-dev-sub`;
    }

    throw new DomainError(
      ErrorCode.INTERNAL_ERROR,
      'Apple OAuth is not configured. Set APPLE_OAUTH_* settings.',
    );
  }

  private async resolveGoogleIdentity(
    input: GoogleOAuthCallbackInput,
    state: OauthStateRecord,
  ): Promise<OAuthIdentity> {
    if (this.isGoogleConfigured()) {
      const idToken = await this.exchangeGoogleCodeForIdToken(input.code);
      const payload = await this.verifyGoogleIdToken(idToken, state.nonce);
      const subject = normalizeOptional(payload.sub);
      if (!subject) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Google ID token did not include a subject.');
      }

      const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : undefined;
      return { subject, email };
    }

    if (this.canUseDevFallback()) {
      const email = normalizeOptional(input.email)
        ? normalizeEmail(input.email as string)
        : undefined;
      const subject = normalizeOptional(input.sub) ?? (email ? `google:${email}` : undefined);
      if (!subject) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Google fallback requires sub or email when provider credentials are not configured.',
        );
      }
      return { subject, email };
    }

    throw new DomainError(
      ErrorCode.INTERNAL_ERROR,
      'Google OAuth callback cannot be processed because provider credentials are missing.',
    );
  }

  private async resolveAppleIdentity(
    input: AppleOAuthCallbackInput,
    state: OauthStateRecord,
  ): Promise<OAuthIdentity> {
    if (this.isAppleConfigured()) {
      const idToken = await this.exchangeAppleCodeForIdToken(input.code);
      const payload = await this.verifyAppleIdToken(idToken, state.nonce);
      const subject = normalizeOptional(payload.sub);
      if (!subject) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Apple ID token did not include a subject.');
      }

      const tokenEmail = typeof payload.email === 'string' ? normalizeEmail(payload.email) : undefined;
      const userEmail = this.parseAppleUserEmail(input.user);
      const fallbackEmail = normalizeOptional(input.email)
        ? normalizeEmail(input.email as string)
        : undefined;

      return {
        subject,
        email: tokenEmail ?? userEmail ?? fallbackEmail,
      };
    }

    if (this.canUseDevFallback()) {
      const subject = normalizeOptional(input.sub);
      if (!subject) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple fallback requires sub when provider credentials are not configured.',
        );
      }

      const email = this.parseAppleUserEmail(input.user)
        ?? (normalizeOptional(input.email) ? normalizeEmail(input.email as string) : undefined);

      return { subject, email };
    }

    throw new DomainError(
      ErrorCode.INTERNAL_ERROR,
      'Apple OAuth callback cannot be processed because provider credentials are missing.',
    );
  }

  private parseAppleUserEmail(userField: string | undefined): string | undefined {
    const raw = normalizeOptional(userField);
    if (!raw) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(raw) as { email?: unknown };
      if (typeof parsed.email === 'string') {
        return normalizeEmail(parsed.email);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async exchangeGoogleCodeForIdToken(code: string): Promise<string> {
    const normalizedCode = normalizeOptional(code);
    if (!normalizedCode) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Google OAuth code is missing.');
    }

    try {
      const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: normalizedCode,
          client_id: this.config.auth.googleClientId as string,
          client_secret: this.config.auth.googleClientSecret as string,
          redirect_uri: this.config.auth.googleRedirectUri as string,
        }).toString(),
      });

      const body = (await response.json()) as { id_token?: string; error?: string; error_description?: string };
      if (!response.ok || !body.id_token) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          body.error_description ?? body.error ?? 'Google OAuth code exchange failed.',
        );
      }

      return body.id_token;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(ErrorCode.INTERNAL_ERROR, 'Google OAuth exchange failed due to network or provider error.');
    }
  }

  private async verifyGoogleIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
    try {
      const jose = await import('jose');
      const verification = await jose.jwtVerify(idToken, await this.getGoogleJwks(), {
        issuer: GOOGLE_ISSUERS,
        audience: this.config.auth.googleClientId,
      });

      if (typeof verification.payload.nonce === 'string' && verification.payload.nonce !== nonce) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Google ID token nonce did not match the auth request.');
      }

      return verification.payload;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Google ID token verification failed.');
    }
  }

  private async exchangeAppleCodeForIdToken(code: string): Promise<string> {
    const normalizedCode = normalizeOptional(code);
    if (!normalizedCode) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Apple OAuth code is missing.');
    }

    const clientSecret = await this.createAppleClientSecret();

    try {
      const response = await fetch(APPLE_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: normalizedCode,
          client_id: this.config.auth.appleClientId as string,
          client_secret: clientSecret,
          redirect_uri: this.config.auth.appleRedirectUri as string,
        }).toString(),
      });

      const body = (await response.json()) as { id_token?: string; error?: string; error_description?: string };
      if (!response.ok || !body.id_token) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          body.error_description ?? body.error ?? 'Apple OAuth code exchange failed.',
        );
      }

      return body.id_token;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(ErrorCode.INTERNAL_ERROR, 'Apple OAuth exchange failed due to network or provider error.');
    }
  }

  private async verifyAppleIdToken(idToken: string, nonce: string): Promise<JWTPayload> {
    try {
      const jose = await import('jose');
      const verification = await jose.jwtVerify(idToken, await this.getAppleJwks(), {
        issuer: APPLE_ISSUER,
        audience: this.config.auth.appleClientId,
      });

      if (typeof verification.payload.nonce === 'string' && verification.payload.nonce !== nonce) {
        throw new DomainError(ErrorCode.UNAUTHORIZED, 'Apple ID token nonce did not match the auth request.');
      }

      return verification.payload;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Apple ID token verification failed.');
    }
  }

  private async createAppleClientSecret(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jose = await import('jose');
    const privateKey = await jose.importPKCS8(
      normalizePrivateKey(this.config.auth.applePrivateKey as string),
      'ES256',
    );

    return new jose.SignJWT({})
      .setProtectedHeader({
        alg: 'ES256',
        kid: this.config.auth.appleKeyId,
      })
      .setIssuer(this.config.auth.appleTeamId as string)
      .setSubject(this.config.auth.appleClientId as string)
      .setAudience(APPLE_ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 24 * 180)
      .sign(privateKey);
  }

  private async getGoogleJwks() {
    if (!this.googleJwks) {
      const jose = await import('jose');
      this.googleJwks = jose.createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
    }

    return this.googleJwks;
  }

  private async getAppleJwks() {
    if (!this.appleJwks) {
      const jose = await import('jose');
      this.appleJwks = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    }

    return this.appleJwks;
  }

  private createUser(email: string, displayName?: string): UserRecord {
    const normalizedEmail = normalizeEmail(email);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Email is already registered.');
    }

    const user: UserRecord = {
      id: randomUUID(),
      email: normalizedEmail,
      display_name: normalizeDisplayName(displayName),
      base_currency: 'USD',
      passkeyCredentialIds: new Set<string>(),
    };

    this.usersByEmail.set(normalizedEmail, user);
    this.usersById.set(user.id, user);

    return user;
  }

  private addPasskeyCredential(
    user: UserRecord,
    input: {
      credentialId: string;
      credential: WebAuthnCredential;
      aaguid?: string;
    },
  ): void {
    const credentialId = normalizeOptional(input.credentialId);
    if (!credentialId) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'credential_id is required.');
    }

    if (this.credentialsById.has(credentialId)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Passkey credential already exists.');
    }

    this.credentialsById.set(credentialId, {
      credentialId,
      userId: user.id,
      credential: {
        id: input.credential.id,
        publicKey: input.credential.publicKey,
        counter: input.credential.counter,
        transports: input.credential.transports,
      },
      aaguid: normalizeOptional(input.aaguid),
      createdAt: new Date().toISOString(),
    });

    user.passkeyCredentialIds.add(credentialId);
  }

  private linkGoogleSubject(user: UserRecord, subject: string): void {
    const normalizedSubject = normalizeOptional(subject);
    if (!normalizedSubject) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Google subject is required.');
    }

    const mappedUserId = this.googleSubjectsToUserIds.get(normalizedSubject);
    if (mappedUserId && mappedUserId !== user.id) {
      throw new DomainError(ErrorCode.CONFLICT, 'Google account is already linked to a different user.');
    }

    user.googleSubject = normalizedSubject;
    this.googleSubjectsToUserIds.set(normalizedSubject, user.id);
  }

  private linkAppleSubject(user: UserRecord, subject: string): void {
    const normalizedSubject = normalizeOptional(subject);
    if (!normalizedSubject) {
      throw new DomainError(ErrorCode.VALIDATION_ERROR, 'Apple subject is required.');
    }

    const mappedUserId = this.appleSubjectsToUserIds.get(normalizedSubject);
    if (mappedUserId && mappedUserId !== user.id) {
      throw new DomainError(ErrorCode.CONFLICT, 'Apple account is already linked to a different user.');
    }

    user.appleSubject = normalizedSubject;
    this.appleSubjectsToUserIds.set(normalizedSubject, user.id);
  }

  private createWebAuthnChallenge(
    purpose: WebAuthnChallengePurpose,
    email: string,
  ): WebAuthnChallengeRecord {
    this.pruneExpiredChallenges();

    const challengeId = randomUUID();
    const challenge = createRandomToken();
    const expiresAt = Date.now() + this.config.auth.challengeTtlSeconds * 1000;

    const record: WebAuthnChallengeRecord = {
      challengeId,
      purpose,
      email,
      challenge,
      expiresAt,
    };

    this.webAuthnChallengesById.set(challengeId, record);
    return record;
  }

  private consumeWebAuthnChallenge(
    challengeId: string,
    expectedPurpose: WebAuthnChallengePurpose,
    expectedEmail: string,
  ): WebAuthnChallengeRecord {
    this.pruneExpiredChallenges();

    const challenge = this.webAuthnChallengesById.get(challengeId);
    if (!challenge) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'WebAuthn challenge is invalid or expired.');
    }

    this.webAuthnChallengesById.delete(challengeId);

    if (challenge.purpose !== expectedPurpose || challenge.email !== expectedEmail) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'WebAuthn challenge does not match this request.');
    }

    return challenge;
  }

  private consumeOauthState(state: string, provider: OauthProvider): OauthStateRecord {
    this.pruneExpiredOauthStates();

    const stateRecord = this.oauthStatesById.get(state);
    if (!stateRecord) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'OAuth state is invalid or expired.');
    }

    this.oauthStatesById.delete(state);

    if (stateRecord.provider !== provider) {
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'OAuth state does not match provider.');
    }

    return stateRecord;
  }

  private createAuthResponse(user: UserRecord): AuthResponse {
    return {
      access_token: this.createSession(user.id),
      token_type: 'Bearer',
      user: this.toUserProfile(user),
    };
  }

  private createSession(userId: string): string {
    const sessionToken = randomUUID();
    const expiresAt = Date.now() + this.config.auth.sessionTtlSeconds * 1000;
    this.sessions.set(sessionToken, { userId, expiresAt });
    return sessionToken;
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();

    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }

  private pruneExpiredChallenges(): void {
    const now = Date.now();

    for (const [challengeId, challenge] of this.webAuthnChallengesById.entries()) {
      if (challenge.expiresAt <= now) {
        this.webAuthnChallengesById.delete(challengeId);
      }
    }
  }

  private pruneExpiredOauthStates(): void {
    const now = Date.now();

    for (const [state, oauthState] of this.oauthStatesById.entries()) {
      if (oauthState.expiresAt <= now) {
        this.oauthStatesById.delete(state);
      }
    }
  }

  private requireUserById(userId: string): UserRecord {
    const user = this.usersById.get(userId);
    if (!user) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }

    return user;
  }

  private toUserProfile(user: UserRecord): UserProfile {
    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      base_currency: user.base_currency,
      linked_auth_methods: {
        passkeys: user.passkeyCredentialIds.size > 0,
        google: Boolean(user.googleSubject),
        apple: Boolean(user.appleSubject),
      },
      passkey_count: user.passkeyCredentialIds.size,
    };
  }
}
