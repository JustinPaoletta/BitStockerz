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
import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import type { JWTPayload, JWTVerifyOptions } from 'jose';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaperAccountProvisioner } from '../trading/paper-account-provisioner.service';
import { AuthPersistenceService } from './auth-persistence.service';
import {
  hashOAuthSecret,
  oauthVerifierChallenge,
  validateOAuthReturnPath,
} from './oauth-browser.helpers';
import type {
  BaseCurrency,
  OauthProvider,
  OauthStateRecord,
  OAuthHandoffRecord,
  PasskeyCredentialRecord,
  SessionRecord,
  UserRecord,
  WebAuthnChallengePurpose,
  WebAuthnChallengeRecord,
} from './auth.records';

export type { BaseCurrency, OauthProvider };

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUTHORIZATION_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

/** Must match verify* `requireUserVerification` (true only when `'required'`). */
const WEBAUTHN_USER_VERIFICATION: 'preferred' | 'required' = 'preferred';

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
  code?: string;
  error?: string;
  email?: string;
  sub?: string;
}

export interface AppleOAuthCallbackInput {
  state: string;
  code?: string;
  error?: string;
  sub?: string;
  email?: string;
  user?: string;
}

interface ProfileUpdate {
  display_name?: string;
  base_currency?: BaseCurrency;
}

interface OAuthIdentity {
  subject: string;
  email?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeDisplayName(
  displayName: string | undefined,
): string | undefined {
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

function createWebAuthnChallengeEntropy(): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(randomBytes(32));
}

function webAuthnRequireUserVerification(): boolean {
  return WEBAUTHN_USER_VERIFICATION === 'required';
}

function toWebAuthnDomainError(error: unknown, fallback: string): DomainError {
  if (error instanceof DomainError) {
    return error;
  }
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : fallback;
  return new DomainError(ErrorCode.UNAUTHORIZED, detail);
}

function normalizePrivateKey(input: string): string {
  return input.replace(/\\n/g, '\n');
}

function toTransports(
  values: string[] | undefined,
): AuthenticatorTransportFuture[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  return values
    .map((value) => value.trim())
    .filter((value): value is AuthenticatorTransportFuture => {
      return [
        'ble',
        'cable',
        'hybrid',
        'internal',
        'nfc',
        'smart-card',
        'usb',
      ].includes(value);
    });
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly usersByEmail = new Map<string, UserRecord>();
  private readonly deletingUsers = new Set<string>();
  private readonly userWrites = new Map<string, Set<Promise<void>>>();
  private readonly usersById = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly credentialsById = new Map<string, PasskeyCredentialRecord>();
  private readonly webAuthnChallengesById = new Map<
    string,
    WebAuthnChallengeRecord
  >();
  private readonly oauthHandoffs = new Map<string, OAuthHandoffRecord>();
  private oauthQueue: Promise<void> = Promise.resolve();
  private readonly oauthStatesById = new Map<string, OauthStateRecord>();
  private readonly googleSubjectsToUserIds = new Map<string, string>();
  private readonly appleSubjectsToUserIds = new Map<string, string>();
  private googleJwks?: ReturnType<
    (typeof import('jose'))['createRemoteJWKSet']
  >;
  private appleJwks?: ReturnType<(typeof import('jose'))['createRemoteJWKSet']>;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly persistence: AuthPersistenceService,
    @Optional()
    private readonly paperAccounts?: PaperAccountProvisioner,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.persistence.hydrate({
      usersByEmail: this.usersByEmail,
      usersById: this.usersById,
      sessions: this.sessions,
      credentialsById: this.credentialsById,
      googleSubjectsToUserIds: this.googleSubjectsToUserIds,
      appleSubjectsToUserIds: this.appleSubjectsToUserIds,
    });
  }

  async ensurePaperAccountForUser(userId: string): Promise<void> {
    if (!this.paperAccounts) return;
    await this.ensureUserPersisted(userId);
    await this.paperAccounts.ensureForUser(userId);
  }

  async ensureUserPersisted(userId: string): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    const user = this.usersById.get(userId);
    if (!user) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `User ${userId} was not found.`,
      );
    }

    if (this.deletingUsers.has(userId))
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    const writes = this.userWrites.get(userId) ?? new Set<Promise<void>>();
    const write = this.persistence.saveUser(user);
    writes.add(write);
    this.userWrites.set(userId, writes);
    try {
      await write;
    } finally {
      writes.delete(write);
      if (!writes.size) this.userWrites.delete(userId);
    }
  }

  async beginAccountDeletion(userId: string): Promise<void> {
    this.deletingUsers.add(userId);
    await Promise.allSettled([...(this.userWrites.get(userId) ?? [])]);
  }
  cancelAccountDeletion(userId: string): void {
    this.deletingUsers.delete(userId);
  }

  async register(email: string, displayName?: string): Promise<AuthResponse> {
    this.assertDevEmailEnabled();
    const normalizedEmail = normalizeEmail(email);
    const user = await this.createUser(normalizedEmail, displayName);

    // Backward-compatible placeholder for the legacy /auth/register endpoint.
    await this.addPasskeyCredential(user, {
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

  async login(email: string): Promise<AuthResponse> {
    this.assertDevEmailEnabled();
    const normalizedEmail = normalizeEmail(email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Invalid email or authentication method.',
      );
    }

    return this.createAuthResponse(user);
  }

  async createWebAuthnRegisterOptions(
    email: string,
  ): Promise<WebAuthnRegisterOptionsResponse> {
    const normalizedEmail = normalizeEmail(email);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Email is already registered.');
    }

    const options = await generateRegistrationOptions({
      rpName: this.config.auth.webauthnRpName,
      rpID: this.config.auth.webauthnRpId,
      userName: normalizedEmail,
      userID: new TextEncoder().encode(normalizedEmail),
      userDisplayName: normalizedEmail,
      challenge: createWebAuthnChallengeEntropy(),
      timeout: this.config.auth.challengeTtlSeconds * 1000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: WEBAUTHN_USER_VERIFICATION,
      },
    });

    const challenge = await this.createWebAuthnChallenge(
      'register',
      normalizedEmail,
      options.challenge,
    );

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

  async verifyWebAuthnRegistration(
    input: WebAuthnRegistrationVerifyInput,
  ): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);

    if (this.usersByEmail.has(normalizedEmail)) {
      throw new DomainError(ErrorCode.CONFLICT, 'Email is already registered.');
    }

    const challengeId = normalizeOptional(input.challengeId);
    if (!challengeId) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'challenge_id is required.',
      );
    }

    const challenge = await this.consumeWebAuthnChallenge(
      challengeId,
      'register',
      normalizedEmail,
    );

    if (input.response) {
      const registrationResponse =
        input.response as unknown as RegistrationResponseJSON;
      let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
      try {
        verification = await verifyRegistrationResponse({
          response: registrationResponse,
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.getExpectedWebAuthnOrigins(),
          expectedRPID: this.config.auth.webauthnRpId,
          requireUserVerification: webAuthnRequireUserVerification(),
        });
      } catch (error) {
        throw toWebAuthnDomainError(
          error,
          'Passkey registration verification failed.',
        );
      }

      if (!verification.verified || !verification.registrationInfo) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Passkey registration verification failed.',
        );
      }

      const user = await this.createUser(normalizedEmail, input.displayName);
      try {
        await this.addPasskeyCredential(user, {
          credentialId: verification.registrationInfo.credential.id,
          credential: {
            id: verification.registrationInfo.credential.id,
            publicKey: verification.registrationInfo.credential.publicKey,
            counter: verification.registrationInfo.credential.counter,
            transports: verification.registrationInfo.credential.transports,
          },
          aaguid: verification.registrationInfo.aaguid,
        });
      } catch (error) {
        this.removeUser(user);
        throw error;
      }
      return this.createAuthResponse(user);
    }

    this.assertLegacyWebauthnEnabled();
    // Compatibility fallback for local/test requests that don't send a full WebAuthn response payload.
    const user = await this.createUser(normalizedEmail, input.displayName);
    try {
      await this.verifyLegacyWebAuthnRegistration(user, challenge, input);
    } catch (error) {
      this.removeUser(user);
      throw error;
    }
    return this.createAuthResponse(user);
  }

  async createWebAuthnLoginOptions(
    email: string,
  ): Promise<WebAuthnLoginOptionsResponse> {
    const normalizedEmail = normalizeEmail(email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user || user.passkeyCredentialIds.size === 0) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'No passkey account found for this email.',
      );
    }

    const options = await generateAuthenticationOptions({
      rpID: this.config.auth.webauthnRpId,
      challenge: createWebAuthnChallengeEntropy(),
      timeout: this.config.auth.challengeTtlSeconds * 1000,
      userVerification: WEBAUTHN_USER_VERIFICATION,
      allowCredentials: [...user.passkeyCredentialIds]
        .map((credentialId) => this.credentialsById.get(credentialId))
        .filter((credential): credential is PasskeyCredentialRecord =>
          Boolean(credential),
        )
        .map((credential) => ({
          id: credential.credential.id,
          transports: credential.credential.transports,
        })),
    });

    const challenge = await this.createWebAuthnChallenge(
      'login',
      normalizedEmail,
      options.challenge,
    );

    return {
      challenge_id: challenge.challengeId,
      challenge: challenge.challenge,
      timeout_ms: this.config.auth.challengeTtlSeconds * 1000,
      user_email: normalizedEmail,
      allow_credentials:
        options.allowCredentials?.map((credential) => credential.id) ?? [],
      options,
    };
  }

  async verifyWebAuthnLogin(
    input: WebAuthnLoginVerifyInput,
  ): Promise<AuthResponse> {
    const normalizedEmail = normalizeEmail(input.email);
    const user = this.usersByEmail.get(normalizedEmail);

    if (!user) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Invalid email or authentication method.',
      );
    }

    const challengeId = normalizeOptional(input.challengeId);
    if (!challengeId) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'challenge_id is required.',
      );
    }

    const challenge = await this.consumeWebAuthnChallenge(
      challengeId,
      'login',
      normalizedEmail,
    );

    if (input.response) {
      const authenticationResponse =
        input.response as unknown as AuthenticationResponseJSON;
      const credentialId = normalizeOptional(authenticationResponse.id);
      if (!credentialId) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Passkey credential is missing from authentication response.',
        );
      }

      const credential = this.credentialsById.get(credentialId);
      if (!credential || credential.userId !== user.id) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Passkey credential does not match this account.',
        );
      }

      let verification: Awaited<
        ReturnType<typeof verifyAuthenticationResponse>
      >;
      try {
        verification = await verifyAuthenticationResponse({
          response: authenticationResponse,
          expectedChallenge: challenge.challenge,
          expectedOrigin: this.getExpectedWebAuthnOrigins(),
          expectedRPID: this.config.auth.webauthnRpId,
          credential: credential.credential,
          requireUserVerification: webAuthnRequireUserVerification(),
        });
      } catch (error) {
        throw toWebAuthnDomainError(
          error,
          'Passkey authentication verification failed.',
        );
      }

      if (!verification.verified) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Passkey authentication verification failed.',
        );
      }

      credential.credential.counter =
        verification.authenticationInfo.newCounter;
      await this.persistence.updateCredentialCounter(
        credential.credentialId,
        credential.credential.counter,
      );
    } else {
      this.assertLegacyWebauthnEnabled();
      this.verifyLegacyWebAuthnLogin(user, input);
      const legacyCredential = this.credentialsById.get(
        normalizeOptional(input.credentialId) as string,
      );
      if (legacyCredential) {
        await this.persistence.updateCredentialCounter(
          legacyCredential.credentialId,
          legacyCredential.credential.counter,
        );
      }
    }

    return this.createAuthResponse(user);
  }

  getOAuthProviders(): { google: boolean; apple: boolean } {
    return {
      google:
        Boolean(this.config.auth.oauthBrowserCallbackUrl) &&
        this.isGoogleConfigured(),
      apple:
        Boolean(this.config.auth.oauthBrowserCallbackUrl) &&
        this.isAppleConfigured(),
    };
  }

  async createOAuthStart(provider: OauthProvider): Promise<OAuthStartResponse> {
    return this.saveOAuthStart(provider, {});
  }

  async createOAuthBrowserStart(
    provider: OauthProvider,
    input: { code_challenge: string; return_path: string },
    sessionToken?: string,
  ): Promise<OAuthStartResponse> {
    if (!this.getOAuthProviders()[provider])
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'This provider is not available.',
      );
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge))
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Invalid verifier challenge.',
      );
    const returnPath = validateOAuthReturnPath(input.return_path);
    const session = sessionToken
      ? await this.requireRecentOAuthSession(sessionToken)
      : undefined;
    return this.saveOAuthStart(provider, {
      mode: 'browser',
      intent: session ? 'link' : 'login',
      codeChallenge: input.code_challenge,
      returnPath,
      initiatingUserId: session?.userId,
      initiatingSessionHash: sessionToken
        ? hashOAuthSecret(sessionToken)
        : undefined,
    });
  }

  private async saveOAuthStart(
    provider: OauthProvider,
    metadata: Partial<OauthStateRecord>,
  ): Promise<OAuthStartResponse> {
    this.pruneExpiredOauthStates();
    for (const [hash, record] of this.oauthHandoffs) {
      if (record.expiresAt <= Date.now()) this.oauthHandoffs.delete(hash);
    }
    if (this.persistence.enabled) await this.persistence.pruneOAuthHandoffs();
    const state = createRandomToken();
    const nonce = createRandomToken();
    const ttlSeconds = this.config.auth.oauthStateTtlSeconds;
    const authorizationUrl = this.buildOAuthAuthorizationUrl(
      provider,
      state,
      nonce,
    );
    const record: OauthStateRecord = {
      state,
      provider,
      nonce,
      expiresAt: Date.now() + ttlSeconds * 1000,
      ...metadata,
    };
    if (this.persistence.enabled) await this.persistence.saveOAuthState(record);
    else this.oauthStatesById.set(state, record);
    return {
      provider,
      state,
      authorization_url: authorizationUrl,
      expires_in_seconds: ttlSeconds,
    };
  }

  async completeGoogleOAuth(
    input: GoogleOAuthCallbackInput,
  ): Promise<AuthResponse> {
    return this.completeJsonOAuth('google', input);
  }

  async completeAppleOAuth(
    input: AppleOAuthCallbackInput,
  ): Promise<AuthResponse> {
    return this.completeJsonOAuth('apple', input);
  }

  private async completeJsonOAuth(
    provider: OauthProvider,
    input: GoogleOAuthCallbackInput | AppleOAuthCallbackInput,
  ): Promise<AuthResponse> {
    const state = await this.consumeOauthState(input.state, provider);
    if (state.mode === 'browser')
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Browser OAuth requires a session exchange.',
      );
    if (input.error)
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Provider authentication was cancelled.',
      );
    const identity = await this.resolveOAuthIdentity(provider, input, state);
    return this.withOAuthLock(async () =>
      this.createAuthResponse(
        await this.resolveOAuthLoginUser(provider, identity),
      ),
    );
  }

  /** Browser mode is selected exclusively by persisted state, never by callback parameters. */
  async handleOAuthCallback(
    provider: OauthProvider,
    input: GoogleOAuthCallbackInput | AppleOAuthCallbackInput,
  ): Promise<AuthResponse | { redirect_url: string }> {
    const known = this.persistence.enabled
      ? await this.persistence.findOAuthState(input.state)
      : this.oauthStatesById.get(input.state);
    if (!known && this.config.auth.oauthBrowserCallbackUrl) {
      return this.oauthRedirect(input.state, undefined, 'invalid_state');
    }
    if (!known || known.mode !== 'browser') {
      return provider === 'google'
        ? this.completeGoogleOAuth(input)
        : this.completeAppleOAuth(input);
    }
    try {
      const state = await this.consumeOauthState(input.state, provider);
      if (input.error)
        return this.oauthRedirect(
          state.state,
          undefined,
          input.error === 'access_denied' ? 'cancelled' : 'provider_failed',
        );
      const identity = await this.resolveOAuthIdentity(provider, input, state);
      return await this.withOAuthLock(async () => {
        const code = createRandomToken();
        const handoff: OAuthHandoffRecord = {
          codeHash: hashOAuthSecret(code),
          userId: state.initiatingUserId ?? '',
          provider,
          intent: state.intent ?? 'login',
          subject: state.intent === 'link' ? identity.subject : undefined,
          email: state.intent === 'link' ? identity.email : undefined,
          codeChallenge: state.codeChallenge!,
          returnPath: state.returnPath!,
          initiatingSessionHash: state.initiatingSessionHash,
          expiresAt: Date.now() + 60_000,
        };
        if (handoff.intent === 'link') {
          if (this.persistence.enabled)
            await this.persistence.saveOAuthHandoff(handoff);
          else this.oauthHandoffs.set(handoff.codeHash, handoff);
        } else {
          const user = await this.resolveOAuthLoginUser(
            provider,
            identity,
            handoff,
          );
          if (!this.persistence.enabled)
            this.oauthHandoffs.set(handoff.codeHash, {
              ...handoff,
              userId: user.id,
            });
        }
        return this.oauthRedirect(state.state, code);
      });
    } catch (error) {
      const failure =
        error instanceof DomainError && error.code === ErrorCode.CONFLICT
          ? 'account_conflict'
          : 'provider_failed';
      return this.oauthRedirect(known.state, undefined, failure);
    }
  }

  private oauthRedirect(
    state: string,
    code?: string,
    error?: string,
  ): { redirect_url: string } {
    const callback = new URL(this.config.auth.oauthBrowserCallbackUrl!);
    callback.hash = new URLSearchParams(
      code ? { code, state } : { error: error ?? 'provider_failed', state },
    ).toString();
    return { redirect_url: callback.toString() };
  }

  private resolveOAuthIdentity(
    provider: OauthProvider,
    input: GoogleOAuthCallbackInput | AppleOAuthCallbackInput,
    state: OauthStateRecord,
  ): Promise<OAuthIdentity> {
    return provider === 'google'
      ? this.resolveGoogleIdentity(input, state)
      : this.resolveAppleIdentity(input, state);
  }

  private cacheOAuthUser(user: UserRecord): UserRecord {
    this.usersById.set(user.id, user);
    this.usersByEmail.set(user.email, user);
    if (user.googleSubject)
      this.googleSubjectsToUserIds.set(user.googleSubject, user.id);
    if (user.appleSubject)
      this.appleSubjectsToUserIds.set(user.appleSubject, user.id);
    return user;
  }

  private async resolveOAuthLoginUser(
    provider: OauthProvider,
    identity: OAuthIdentity,
    handoff?: OAuthHandoffRecord,
  ): Promise<UserRecord> {
    if (this.persistence.enabled) {
      return this.cacheOAuthUser(
        await this.persistence.resolveOAuthUser(
          provider,
          identity,
          this.config.trading.paperStartingBalance,
          handoff,
        ),
      );
    }
    const subjects =
      provider === 'google'
        ? this.googleSubjectsToUserIds
        : this.appleSubjectsToUserIds;
    const known = subjects.get(identity.subject);
    if (known) return this.requireUserById(known);
    if (identity.email && this.usersByEmail.has(identity.email)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Sign in to the existing account and link this provider in account settings.',
      );
    }
    if (
      !identity.email &&
      ((provider === 'google'
        ? this.isGoogleConfigured()
        : this.isAppleConfigured()) ||
        !this.canUseDevFallback())
    )
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'A verified provider email is required for signup.',
      );
    const user: UserRecord = {
      id: randomUUID(),
      email: identity.email ?? `${identity.subject}@${provider}.private`,
      base_currency: 'USD',
      passkeyCredentialIds: new Set(),
    };
    // Provision before publishing to the in-memory identity maps.
    if (this.paperAccounts) await this.paperAccounts.ensureForUser(user.id);
    if (provider === 'google') user.googleSubject = identity.subject;
    else user.appleSubject = identity.subject;
    subjects.set(identity.subject, user.id);
    return this.cacheOAuthUser(user);
  }

  async exchangeOAuthSession(
    input: { code: string; verifier: string },
    sessionToken?: string,
  ): Promise<AuthResponse & { return_path: string; intent: 'login' | 'link' }> {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(input.code) ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(input.verifier)
    )
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'OAuth handoff is invalid.',
      );
    return this.withOAuthLock(async () => {
      const codeHash = hashOAuthSecret(input.code);
      const codeChallenge = oauthVerifierChallenge(input.verifier);
      const signedInAt = Date.now();
      const loginSession = {
        token: randomUUID(),
        expiresAt: signedInAt + this.config.auth.sessionTtlSeconds * 1000,
        signedInAt,
      };
      let handoff: OAuthHandoffRecord;
      let user: UserRecord;
      if (this.persistence.enabled) {
        const result = await this.persistence.redeemOAuthHandoff(
          codeHash,
          codeChallenge,
          sessionToken,
          loginSession,
        );
        handoff = result.handoff;
        user = this.cacheOAuthUser(result.user);
      } else {
        const stored = this.oauthHandoffs.get(codeHash);
        if (
          !stored ||
          stored.expiresAt <= Date.now() ||
          stored.codeChallenge !== codeChallenge
        )
          throw new DomainError(
            ErrorCode.UNAUTHORIZED,
            'OAuth handoff is invalid or expired.',
          );
        handoff = stored;
        user = this.requireUserById(handoff.userId);
        if (handoff.intent === 'link') {
          const session = sessionToken
            ? await this.requireRecentOAuthSession(sessionToken)
            : undefined;
          if (
            !session ||
            session.userId !== user.id ||
            hashOAuthSecret(sessionToken!) !== handoff.initiatingSessionHash
          )
            throw new DomainError(
              ErrorCode.UNAUTHORIZED,
              'The original signed-in session is required.',
            );
          const subjects =
            handoff.provider === 'google'
              ? this.googleSubjectsToUserIds
              : this.appleSubjectsToUserIds;
          const subjectUser = subjects.get(handoff.subject!);
          const currentSubject =
            handoff.provider === 'google'
              ? user.googleSubject
              : user.appleSubject;
          if (
            (subjectUser && subjectUser !== user.id) ||
            (currentSubject && currentSubject !== handoff.subject)
          )
            throw new DomainError(
              ErrorCode.CONFLICT,
              'This provider is already linked to an account.',
            );
          subjects.set(handoff.subject!, user.id);
          if (handoff.provider === 'google')
            user.googleSubject = handoff.subject;
          else user.appleSubject = handoff.subject;
        }
        this.oauthHandoffs.delete(codeHash);
      }
      const token =
        handoff.intent === 'link' ? sessionToken! : loginSession.token;
      if (handoff.intent === 'login')
        this.sessions.set(token, {
          userId: user.id,
          expiresAt: loginSession.expiresAt,
          signedInAt,
        });
      return {
        access_token: token,
        token_type: 'Bearer',
        user: this.toUserProfile(user),
        return_path: handoff.returnPath,
        intent: handoff.intent,
      };
    });
  }

  private async requireRecentOAuthSession(
    token: string,
  ): Promise<SessionRecord> {
    this.requireUserBySessionToken(token);
    const session = this.persistence.enabled
      ? await this.persistence.findSession(token)
      : this.sessions.get(token);
    if (
      !session ||
      !session.signedInAt ||
      session.signedInAt < Date.now() - 300_000
    )
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Sign in again before linking this provider.',
      );
    return session;
  }

  private async withOAuthLock<T>(work: () => Promise<T>): Promise<T> {
    const pending = this.oauthQueue;
    let release!: () => void;
    this.oauthQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await pending;
    try {
      return await work();
    } finally {
      release();
    }
  }

  async assertRecentSession(token: string): Promise<void> {
    await this.requireRecentOAuthSession(token);
  }

  listSessions(token: string) {
    const user = this.requireUserBySessionToken(token);
    return {
      sessions: [...this.sessions.entries()]
        .filter(
          ([, item]) => item.userId === user.id && item.expiresAt > Date.now(),
        )
        .map(([key, item]) => ({
          id: hashOAuthSecret(key),
          current: key === token,
          created_at: item.signedInAt
            ? new Date(item.signedInAt).toISOString()
            : null,
          expires_at: new Date(item.expiresAt).toISOString(),
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  async revokeSession(token: string, id: string): Promise<void> {
    await this.assertRecentSession(token);
    const user = this.requireUserBySessionToken(token);
    const entry = [...this.sessions.entries()].find(
      ([key, session]) =>
        session.userId === user.id && hashOAuthSecret(key) === id,
    );
    if (!entry) throw new DomainError(ErrorCode.NOT_FOUND);
    await this.logout(entry[0]);
  }

  listPasskeys(token: string) {
    const user = this.requireUserBySessionToken(token);
    return {
      passkeys: [...user.passkeyCredentialIds]
        .map((id) => this.credentialsById.get(id))
        .filter((item): item is PasskeyCredentialRecord => Boolean(item))
        .map((item) => ({
          id: hashOAuthSecret(item.credentialId),
          created_at: item.createdAt,
        })),
    };
  }

  async createAdditionalPasskeyOptions(token: string) {
    await this.assertRecentSession(token);
    const user = this.requireUserBySessionToken(token);
    const options = await generateRegistrationOptions({
      rpName: this.config.auth.webauthnRpName,
      rpID: this.config.auth.webauthnRpId,
      userID: new TextEncoder().encode(user.email),
      userName: user.email,
      userDisplayName: user.display_name ?? user.email,
      challenge: createWebAuthnChallengeEntropy(),
      timeout: this.config.auth.challengeTtlSeconds * 1000,
      attestationType: 'none',
      excludeCredentials: [...user.passkeyCredentialIds].map((id) => ({ id })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });
    const challenge = await this.createWebAuthnChallenge(
      'enroll',
      user.email,
      options.challenge,
      { userId: user.id, sessionHash: hashOAuthSecret(token) },
    );
    return { challenge_id: challenge.challengeId, options };
  }

  async verifyAdditionalPasskey(
    token: string,
    challengeId: string,
    response: RegistrationResponseJSON,
  ) {
    await this.assertRecentSession(token);
    const user = this.requireUserBySessionToken(token);
    const challenge = await this.consumeWebAuthnChallenge(
      challengeId,
      'enroll',
      user.email,
    );
    if (
      challenge.userId !== user.id ||
      challenge.sessionHash !== hashOAuthSecret(token)
    )
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.getExpectedWebAuthnOrigins(),
        expectedRPID: this.config.auth.webauthnRpId,
        requireUserVerification: true,
      });
    } catch {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Passkey enrollment verification failed.',
      );
    }
    if (!verification.verified || !verification.registrationInfo)
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    await this.addPasskeyCredential(user, {
      credentialId: verification.registrationInfo.credential.id,
      credential: verification.registrationInfo.credential,
      aaguid: verification.registrationInfo.aaguid,
    });
    return this.listPasskeys(token);
  }

  async removePasskey(token: string, id: string): Promise<void> {
    await this.assertRecentSession(token);
    const user = this.requireUserBySessionToken(token);
    const credentialId = [...user.passkeyCredentialIds].find(
      (key) => hashOAuthSecret(key) === id,
    );
    if (!credentialId) throw new DomainError(ErrorCode.NOT_FOUND);
    if (
      user.passkeyCredentialIds.size <= 1 &&
      !user.googleSubject &&
      !user.appleSubject
    )
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Add another sign-in method before removing your last passkey.',
      );
    if (this.prisma.isEnabled)
      await this.prisma.webAuthnCredential.deleteMany({
        where: { credentialId, userId: user.id },
      });
    user.passkeyCredentialIds.delete(credentialId);
    this.credentialsById.delete(credentialId);
  }

  forgetUser(userId: string): void {
    const user = this.usersById.get(userId);
    if (!user) return;
    for (const [token, session] of this.sessions)
      if (session.userId === userId) this.sessions.delete(token);
    for (const id of user.passkeyCredentialIds) this.credentialsById.delete(id);
    if (user.googleSubject)
      this.googleSubjectsToUserIds.delete(user.googleSubject);
    if (user.appleSubject)
      this.appleSubjectsToUserIds.delete(user.appleSubject);
    for (const [id, challenge] of this.webAuthnChallengesById)
      if (challenge.email === user.email)
        this.webAuthnChallengesById.delete(id);
    for (const [id, state] of this.oauthStatesById)
      if (state.initiatingUserId === userId) this.oauthStatesById.delete(id);
    for (const [id, handoff] of this.oauthHandoffs)
      if (handoff.userId === userId) this.oauthHandoffs.delete(id);
    this.removeUser(user);
  }

  async logout(sessionToken: string): Promise<void> {
    const deleted = this.sessions.delete(sessionToken);
    if (this.persistence.enabled) {
      await this.persistence.deleteSession(sessionToken);
    }
    if (!deleted) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
  }

  getProfileBySessionToken(sessionToken: string): UserProfile {
    return this.toUserProfile(this.requireUserBySessionToken(sessionToken));
  }

  async updateProfileBySessionToken(
    sessionToken: string,
    update: ProfileUpdate,
  ): Promise<UserProfile> {
    const user = this.requireUserBySessionToken(sessionToken);

    const updated: UserRecord = { ...user };
    if (update.display_name !== undefined)
      updated.display_name = normalizeDisplayName(update.display_name);
    if (update.base_currency !== undefined)
      updated.base_currency = update.base_currency;
    await this.persistence.updateUserProfile(updated);
    user.display_name = updated.display_name;
    user.base_currency = updated.base_currency;
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
      if (this.persistence.enabled) {
        void this.persistence.deleteSession(sessionToken);
      }
      throw new DomainError(ErrorCode.UNAUTHORIZED, 'Session has expired.');
    }

    if (this.deletingUsers.has(session.userId))
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    return this.requireUserById(session.userId);
  }

  private assertDevEmailEnabled(): void {
    if (!this.config.auth.devEmailEnabled) {
      throw new DomainError(ErrorCode.NOT_FOUND);
    }
  }

  private assertLegacyWebauthnEnabled(): void {
    if (!this.config.auth.legacyWebauthnEnabled) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Passkey verification requires a WebAuthn response.',
      );
    }
  }

  private async verifyLegacyWebAuthnRegistration(
    user: UserRecord,
    challenge: WebAuthnChallengeRecord,
    input: WebAuthnRegistrationVerifyInput,
  ): Promise<void> {
    const challengeResponse = normalizeOptional(input.challenge);
    const credentialId = normalizeOptional(input.credentialId);
    const publicKey = normalizeOptional(input.publicKey);

    if (
      !challengeResponse ||
      challengeResponse !== challenge.challenge ||
      !credentialId ||
      !publicKey
    ) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'WebAuthn challenge verification failed.',
      );
    }

    const signCount = input.signCount ?? 0;
    if (signCount < 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'sign_count must be >= 0.',
      );
    }

    await this.addPasskeyCredential(user, {
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

  private verifyLegacyWebAuthnLogin(
    user: UserRecord,
    input: WebAuthnLoginVerifyInput,
  ): void {
    const credentialId = normalizeOptional(input.credentialId);
    if (!credentialId || !user.passkeyCredentialIds.has(credentialId)) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Passkey credential does not match this account.',
      );
    }

    const credential = this.credentialsById.get(credentialId);
    if (!credential) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Passkey credential does not match this account.',
      );
    }

    const signCount = input.signCount;
    if (signCount === undefined || signCount <= credential.credential.counter) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Passkey assertion failed counter validation.',
      );
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

    return ['http://localhost:4200'];
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

  private buildOAuthAuthorizationUrl(
    provider: OauthProvider,
    state: string,
    nonce: string,
  ): string {
    if (provider === 'google') {
      if (this.isGoogleConfigured()) {
        const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
        url.searchParams.set(
          'client_id',
          this.config.auth.googleClientId as string,
        );
        url.searchParams.set(
          'redirect_uri',
          this.config.auth.googleRedirectUri as string,
        );
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
      url.searchParams.set(
        'client_id',
        this.config.auth.appleClientId as string,
      );
      url.searchParams.set(
        'redirect_uri',
        this.config.auth.appleRedirectUri as string,
      );
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
      const idToken = await this.exchangeGoogleCodeForIdToken(input.code ?? '');
      const payload = await this.verifyGoogleIdToken(idToken, state.nonce);
      const subject =
        typeof payload.sub === 'string' &&
        payload.sub.length <= 255 &&
        !Array.from(payload.sub).some(
          (char) =>
            /\s/.test(char) ||
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127,
        )
          ? payload.sub
          : undefined;
      if (!subject) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Google ID token did not include a subject.',
        );
      }

      if (
        payload.email !== undefined &&
        (typeof payload.email !== 'string' ||
          !isEmail(payload.email) ||
          payload.email_verified !== true)
      ) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Google email is not verified.',
        );
      }
      const email =
        typeof payload.email === 'string'
          ? normalizeEmail(payload.email)
          : undefined;
      return {
        subject,
        email,
      };
    }

    if (this.canUseDevFallback()) {
      const email = normalizeOptional(input.email)
        ? normalizeEmail(input.email as string)
        : undefined;
      const subject =
        normalizeOptional(input.sub) ?? (email ? `google:${email}` : undefined);
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
      const idToken = await this.exchangeAppleCodeForIdToken(input.code ?? '');
      const payload = await this.verifyAppleIdToken(idToken, state.nonce);
      const subject =
        typeof payload.sub === 'string' &&
        payload.sub.length <= 255 &&
        !Array.from(payload.sub).some(
          (char) =>
            /\s/.test(char) ||
            char.charCodeAt(0) < 32 ||
            char.charCodeAt(0) === 127,
        )
          ? payload.sub
          : undefined;
      if (!subject) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple ID token did not include a subject.',
        );
      }

      if (
        payload.email !== undefined &&
        (typeof payload.email !== 'string' ||
          !isEmail(payload.email) ||
          (payload.email_verified !== true &&
            payload.email_verified !== 'true'))
      ) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple email is not verified.',
        );
      }
      const tokenEmail =
        typeof payload.email === 'string'
          ? normalizeEmail(payload.email)
          : undefined;
      return { subject, email: tokenEmail };
    }

    if (this.canUseDevFallback()) {
      const subject = normalizeOptional(input.sub);
      if (!subject) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple fallback requires sub when provider credentials are not configured.',
        );
      }

      const email =
        this.parseAppleUserEmail(input.user) ??
        (normalizeOptional(input.email)
          ? normalizeEmail(input.email as string)
          : undefined);

      return { subject, email };
    }

    throw new DomainError(
      ErrorCode.INTERNAL_ERROR,
      'Apple OAuth callback cannot be processed because provider credentials are missing.',
    );
  }

  private parseAppleUserEmail(
    userField: string | undefined,
  ): string | undefined {
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
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Google OAuth code is missing.',
      );
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

      const body = (await response.json()) as {
        id_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !body.id_token) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Google OAuth code exchange failed.',
        );
      }

      return body.id_token;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        ErrorCode.INTERNAL_ERROR,
        'Google OAuth exchange failed due to network or provider error.',
      );
    }
  }

  private async verifyGoogleIdToken(
    idToken: string,
    nonce: string,
  ): Promise<JWTPayload> {
    try {
      const verification = await this.verifyProviderJwt(idToken, 'google', {
        issuer: GOOGLE_ISSUERS,
        audience: this.config.auth.googleClientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      });

      if (verification.payload.nonce !== nonce) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Google ID token nonce did not match the auth request.',
        );
      }

      return verification.payload;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Google ID token verification failed.',
      );
    }
  }

  private async exchangeAppleCodeForIdToken(code: string): Promise<string> {
    const normalizedCode = normalizeOptional(code);
    if (!normalizedCode) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Apple OAuth code is missing.',
      );
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

      const body = (await response.json()) as {
        id_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!response.ok || !body.id_token) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple OAuth code exchange failed.',
        );
      }

      return body.id_token;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        ErrorCode.INTERNAL_ERROR,
        'Apple OAuth exchange failed due to network or provider error.',
      );
    }
  }

  private async verifyAppleIdToken(
    idToken: string,
    nonce: string,
  ): Promise<JWTPayload> {
    try {
      const verification = await this.verifyProviderJwt(idToken, 'apple', {
        issuer: APPLE_ISSUER,
        audience: this.config.auth.appleClientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
      });

      if (verification.payload.nonce !== nonce) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'Apple ID token nonce did not match the auth request.',
        );
      }

      return verification.payload;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }

      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'Apple ID token verification failed.',
      );
    }
  }

  private async verifyProviderJwt(
    idToken: string,
    provider: OauthProvider,
    options: JWTVerifyOptions,
  ): Promise<{ payload: JWTPayload }> {
    const jose = await import('jose');
    return jose.jwtVerify(
      idToken,
      provider === 'google'
        ? await this.getGoogleJwks()
        : await this.getAppleJwks(),
      options,
    );
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

  private async createUser(
    email: string,
    displayName?: string,
  ): Promise<UserRecord> {
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

    await this.persistence.saveUser(user);
    this.usersByEmail.set(normalizedEmail, user);
    this.usersById.set(user.id, user);

    return user;
  }

  private removeUser(user: UserRecord): void {
    this.usersByEmail.delete(user.email);
    this.usersById.delete(user.id);
    for (const credentialId of user.passkeyCredentialIds) {
      this.credentialsById.delete(credentialId);
    }
    user.passkeyCredentialIds.clear();
  }

  private async addPasskeyCredential(
    user: UserRecord,
    input: {
      credentialId: string;
      credential: WebAuthnCredential;
      aaguid?: string;
    },
  ): Promise<void> {
    const credentialId = normalizeOptional(input.credentialId);
    if (!credentialId) {
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'credential_id is required.',
      );
    }

    if (this.credentialsById.has(credentialId)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Passkey credential already exists.',
      );
    }

    const record: PasskeyCredentialRecord = {
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
    };
    await this.persistence.saveCredential(record);
    this.credentialsById.set(credentialId, record);
    user.passkeyCredentialIds.add(credentialId);
  }

  private async createWebAuthnChallenge(
    purpose: WebAuthnChallengePurpose,
    email: string,
    challenge: string,
    owner?: { userId: string; sessionHash: string },
  ): Promise<WebAuthnChallengeRecord> {
    this.pruneExpiredChallenges();

    const challengeId = randomUUID();
    const expiresAt = Date.now() + this.config.auth.challengeTtlSeconds * 1000;

    const record: WebAuthnChallengeRecord = {
      challengeId,
      purpose,
      email,
      challenge,
      expiresAt,
      ...owner,
    };

    if (this.persistence.enabled) {
      await this.persistence.saveWebAuthnChallenge(record);
    } else {
      this.webAuthnChallengesById.set(challengeId, record);
    }
    return record;
  }

  private async consumeWebAuthnChallenge(
    challengeId: string,
    expectedPurpose: WebAuthnChallengePurpose,
    expectedEmail: string,
  ): Promise<WebAuthnChallengeRecord> {
    if (this.persistence.enabled) {
      const challenge = await this.persistence.consumeWebAuthnChallenge(
        challengeId,
        expectedPurpose,
        expectedEmail,
      );
      if (!challenge) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'WebAuthn challenge is invalid or expired.',
        );
      }
      return challenge;
    }

    this.pruneExpiredChallenges();

    const challenge = this.webAuthnChallengesById.get(challengeId);
    if (!challenge) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'WebAuthn challenge is invalid or expired.',
      );
    }

    this.webAuthnChallengesById.delete(challengeId);

    if (
      challenge.purpose !== expectedPurpose ||
      challenge.email !== expectedEmail
    ) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'WebAuthn challenge does not match this request.',
      );
    }

    return challenge;
  }

  private async consumeOauthState(
    state: string,
    provider: OauthProvider,
  ): Promise<OauthStateRecord> {
    if (this.persistence.enabled) {
      const stateRecord = await this.persistence.consumeOAuthState(
        state,
        provider,
      );
      if (!stateRecord) {
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'OAuth state is invalid or expired.',
        );
      }
      return stateRecord;
    }

    this.pruneExpiredOauthStates();

    const stateRecord = this.oauthStatesById.get(state);
    if (!stateRecord) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'OAuth state is invalid or expired.',
      );
    }

    if (stateRecord.provider !== provider) {
      throw new DomainError(
        ErrorCode.UNAUTHORIZED,
        'OAuth state does not match provider.',
      );
    }

    this.oauthStatesById.delete(state);
    return stateRecord;
  }

  private async createAuthResponse(user: UserRecord): Promise<AuthResponse> {
    return {
      access_token: await this.createSession(user.id),
      token_type: 'Bearer',
      user: this.toUserProfile(user),
    };
  }

  private async createSession(userId: string): Promise<string> {
    const sessionToken = randomUUID();
    const expiresAt = Date.now() + this.config.auth.sessionTtlSeconds * 1000;
    const signedInAt = Date.now();
    await this.persistence.saveSession(
      sessionToken,
      userId,
      expiresAt,
      signedInAt,
    );
    this.sessions.set(sessionToken, { userId, expiresAt, signedInAt });
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

    for (const [
      challengeId,
      challenge,
    ] of this.webAuthnChallengesById.entries()) {
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
