import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

function createConfig(
  overrides?: Partial<AppConfigService['auth']>,
  server?: Partial<AppConfigService['server']>,
): AppConfigService {
  return {
    server: {
      nodeEnv: 'test',
      ...server,
    } as AppConfigService['server'],
    auth: {
      sessionTtlSeconds: 3600,
      challengeTtlSeconds: 300,
      oauthStateTtlSeconds: 300,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 30,
      webauthnRpId: 'localhost',
      webauthnRpName: 'BitStockerz',
      webauthnAllowedOrigins: [],
      googleClientId: undefined,
      googleClientSecret: undefined,
      googleRedirectUri: undefined,
      appleClientId: undefined,
      appleTeamId: undefined,
      appleKeyId: undefined,
      applePrivateKey: undefined,
      appleRedirectUri: undefined,
      ...overrides,
    },
  } as AppConfigService;
}

function createPrismaMock(overrides?: Partial<PrismaService>): PrismaService {
  return {
    isEnabled: false,
    ...overrides,
  } as PrismaService;
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(createConfig(), createPrismaMock());
  });

  it('registers a user and creates a bearer token session', () => {
    const result = service.register('USER@Example.com', '  Justin  ');

    expect(result.token_type).toBe('Bearer');
    expect(result.access_token).toBeDefined();
    expect(result.user.email).toBe('user@example.com');
    expect(result.user.display_name).toBe('Justin');
    expect(result.user.base_currency).toBe('USD');
    expect(result.user.linked_auth_methods).toEqual({
      passkeys: true,
      google: false,
      apple: false,
    });
    expect(result.user.passkey_count).toBe(1);
  });

  it('persists registered users to mysql when prisma is enabled', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const create = jest.fn().mockResolvedValue({});
    const prisma = createPrismaMock({
      isEnabled: true,
      user: { findUnique, create, update: jest.fn(), delete: jest.fn() },
      job: { deleteMany: jest.fn() },
    } as Partial<PrismaService>);
    const dbService = new AuthService(createConfig(), prisma);
    const result = dbService.register('persist@example.com', 'Persist User');

    await dbService.ensureUserPersisted(result.user.id);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: result.user.id } });
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'persist@example.com' },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: result.user.id,
          email: 'persist@example.com',
        }),
      }),
    );
  });

  it('replaces stale mysql users that share an email but not the in-memory id', async () => {
    const staleUserId = '00000000-0000-4000-8000-000000000099';
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: staleUserId, email: 'persist@example.com' });
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const deleteUser = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({});
    const prisma = createPrismaMock({
      isEnabled: true,
      user: {
        findUnique,
        create,
        update: jest.fn(),
        delete: deleteUser,
      },
      job: { deleteMany },
    } as Partial<PrismaService>);
    const dbService = new AuthService(createConfig(), prisma);
    const result = dbService.register('persist@example.com', 'Persist User');

    await dbService.ensureUserPersisted(result.user.id);

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: staleUserId } });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: staleUserId } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: result.user.id }),
      }),
    );
  });

  it('rejects duplicate registration for the same email', () => {
    service.register('user@example.com');

    expect(() => service.register('USER@example.com')).toThrow(DomainError);
  });

  it('logs in an existing user and returns a fresh token', () => {
    const registered = service.register('user@example.com');

    const login = service.login('user@example.com');

    expect(login.user.id).toBe(registered.user.id);
    expect(login.access_token).not.toBe(registered.access_token);
  });

  it('rejects login for unknown users', () => {
    try {
      service.login('missing@example.com');
      fail('Expected missing user login to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('returns and updates profile by session token', () => {
    const registration = service.register('user@example.com');

    const profile = service.getProfileBySessionToken(registration.access_token);
    expect(profile.email).toBe('user@example.com');

    const updated = service.updateProfileBySessionToken(
      registration.access_token,
      {
        display_name: '  Trader Joe  ',
        base_currency: 'USD',
      },
    );

    expect(updated.display_name).toBe('Trader Joe');
    expect(updated.base_currency).toBe('USD');
  });

  it('clears display name when updated with blank spaces', () => {
    const registration = service.register('user@example.com', 'Named User');

    const updated = service.updateProfileBySessionToken(
      registration.access_token,
      {
        display_name: '   ',
      },
    );

    expect(updated.display_name).toBeUndefined();
  });

  it('invalidates tokens on logout', () => {
    const registration = service.register('user@example.com');
    service.logout(registration.access_token);

    expect(() =>
      service.getProfileBySessionToken(registration.access_token),
    ).toThrow(DomainError);
  });

  it('creates and verifies a webauthn registration flow', async () => {
    const options = await service.createWebAuthnRegisterOptions(
      'passkey@example.com',
    );

    const result = await service.verifyWebAuthnRegistration({
      email: 'passkey@example.com',
      challengeId: options.challenge_id,
      challenge: options.challenge,
      credentialId: 'cred-passkey-1',
      publicKey: 'public-key-value',
      signCount: 10,
      transports: ['internal'],
      aaguid: 'aaguid-1',
    });

    expect(result.user.email).toBe('passkey@example.com');
    expect(result.user.passkey_count).toBe(1);
    expect(result.user.linked_auth_methods.passkeys).toBe(true);
  });

  it('rejects replayed webauthn registration challenge', async () => {
    const options = await service.createWebAuthnRegisterOptions(
      'passkey@example.com',
    );

    await service.verifyWebAuthnRegistration({
      email: 'passkey@example.com',
      challengeId: options.challenge_id,
      challenge: options.challenge,
      credentialId: 'cred-passkey-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    await expect(
      service.verifyWebAuthnRegistration({
        email: 'other@example.com',
        challengeId: options.challenge_id,
        challenge: options.challenge,
        credentialId: 'cred-passkey-2',
        publicKey: 'public-key-value',
        signCount: 10,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('creates and verifies a webauthn login flow', async () => {
    const registerOptions =
      await service.createWebAuthnRegisterOptions('login@example.com');
    await service.verifyWebAuthnRegistration({
      email: 'login@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-login-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    const loginOptions =
      await service.createWebAuthnLoginOptions('login@example.com');
    expect(loginOptions.allow_credentials).toEqual(['cred-login-1']);

    const loginResult = await service.verifyWebAuthnLogin({
      email: 'login@example.com',
      challengeId: loginOptions.challenge_id,
      challenge: loginOptions.challenge,
      credentialId: 'cred-login-1',
      signCount: 11,
    });

    expect(loginResult.user.email).toBe('login@example.com');
  });

  it('rejects webauthn login when sign counter does not advance', async () => {
    const registerOptions = await service.createWebAuthnRegisterOptions(
      'counter@example.com',
    );
    await service.verifyWebAuthnRegistration({
      email: 'counter@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-counter-1',
      publicKey: 'public-key-value',
      signCount: 50,
    });

    const loginOptions = await service.createWebAuthnLoginOptions(
      'counter@example.com',
    );

    await expect(
      service.verifyWebAuthnLogin({
        email: 'counter@example.com',
        challengeId: loginOptions.challenge_id,
        challenge: loginOptions.challenge,
        credentialId: 'cred-counter-1',
        signCount: 50,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('creates and consumes google oauth state, linking by email', async () => {
    const seeded = service.register('oauth@example.com');
    expect(seeded.user.linked_auth_methods.google).toBe(false);

    const start = service.createOAuthStart('google');
    const callback = await service.completeGoogleOAuth({
      state: start.state,
      code: 'oauth-code-1',
      email: 'oauth@example.com',
      sub: 'google-subject-123',
    });

    expect(callback.user.linked_auth_methods.google).toBe(true);
    expect(callback.user.email).toBe('oauth@example.com');

    const secondStart = service.createOAuthStart('google');
    const secondLogin = await service.completeGoogleOAuth({
      state: secondStart.state,
      code: 'oauth-code-2',
      email: 'other-email@example.com',
      sub: 'google-subject-123',
    });

    expect(secondLogin.user.id).toBe(callback.user.id);
  });

  it('creates apple oauth user when email is not available, then reuses by subject', async () => {
    const start = service.createOAuthStart('apple');
    const first = await service.completeAppleOAuth({
      state: start.state,
      code: 'apple-code-1',
      sub: 'apple-subject-1',
    });

    expect(first.user.email).toBe('apple-subject-1@apple.private');
    expect(first.user.linked_auth_methods.apple).toBe(true);

    const secondStart = service.createOAuthStart('apple');
    const second = await service.completeAppleOAuth({
      state: secondStart.state,
      code: 'apple-code-2',
      sub: 'apple-subject-1',
      email: 'ignored@example.com',
    });

    expect(second.user.id).toBe(first.user.id);
  });

  it('expires sessions based on configured ttl', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));

    const shortTtlService = new AuthService(
      createConfig({ sessionTtlSeconds: 1 }),
      createPrismaMock(),
    );
    const registration = shortTtlService.register('ttl@example.com');

    jest.advanceTimersByTime(1100);

    expect(() =>
      shortTtlService.getProfileBySessionToken(registration.access_token),
    ).toThrow(DomainError);

    jest.useRealTimers();
  });

  it('rejects webauthn registration options when the email is already registered', async () => {
    service.register('dup@example.com');

    await expect(
      service.createWebAuthnRegisterOptions('dup@example.com'),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
  });

  it('requires challenge_id for webauthn registration verification', async () => {
    await expect(
      service.verifyWebAuthnRegistration({
        email: 'missing-challenge@example.com',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects webauthn login options when no passkey account exists', async () => {
    await expect(
      service.createWebAuthnLoginOptions('missing@example.com'),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('rejects webauthn login for unknown users and missing challenge ids', async () => {
    await expect(
      service.verifyWebAuthnLogin({
        email: 'missing@example.com',
        challengeId: 'challenge-1',
        challenge: 'abc',
        credentialId: 'cred-1',
        signCount: 1,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });

    const registerOptions = await service.createWebAuthnRegisterOptions(
      'challenge@example.com',
    );
    await service.verifyWebAuthnRegistration({
      email: 'challenge@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-challenge-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    await expect(
      service.verifyWebAuthnLogin({
        email: 'challenge@example.com',
        challenge: registerOptions.challenge,
        credentialId: 'cred-challenge-1',
        signCount: 11,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects legacy webauthn login when the credential is unknown', async () => {
    const registerOptions = await service.createWebAuthnRegisterOptions(
      'legacy-login@example.com',
    );
    await service.verifyWebAuthnRegistration({
      email: 'legacy-login@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-legacy-login',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    const loginOptions = await service.createWebAuthnLoginOptions(
      'legacy-login@example.com',
    );

    await expect(
      service.verifyWebAuthnLogin({
        email: 'legacy-login@example.com',
        challengeId: loginOptions.challenge_id,
        challenge: loginOptions.challenge,
        credentialId: 'missing-credential',
        signCount: 11,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('uses configured webauthn origins when provided', async () => {
    const configuredService = new AuthService(
      createConfig({ webauthnAllowedOrigins: ['https://app.example.com'] }),
      createPrismaMock(),
    );

    await expect(
      configuredService.createWebAuthnRegisterOptions('origins@example.com'),
    ).resolves.toMatchObject({
      user_email: 'origins@example.com',
    });
  });

  it('rejects logout for unknown session tokens', () => {
    expect(() => service.logout('missing-token')).toThrow(DomainError);
  });

  it('builds provider authorization urls when oauth credentials are configured', () => {
    const configuredService = new AuthService(
      createConfig({
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
        googleRedirectUri:
          'http://localhost:4000/api/auth/oauth/google/callback',
        appleClientId: 'apple-client',
        appleTeamId: 'apple-team',
        appleKeyId: 'apple-key',
        applePrivateKey:
          '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
        appleRedirectUri: 'http://localhost:4000/api/auth/oauth/apple/callback',
      }),
      createPrismaMock(),
    );

    const googleStart = configuredService.createOAuthStart('google');
    expect(googleStart.authorization_url).toContain(
      'accounts.google.com/o/oauth2/v2/auth',
    );
    expect(googleStart.authorization_url).toContain('client_id=google-client');

    const appleStart = configuredService.createOAuthStart('apple');
    expect(appleStart.authorization_url).toContain(
      'appleid.apple.com/auth/authorize',
    );
    expect(appleStart.authorization_url).toContain('client_id=apple-client');
  });

  it('rejects google fallback callbacks without subject or email', async () => {
    const start = service.createOAuthStart('google');

    await expect(
      service.completeGoogleOAuth({
        state: start.state,
        code: 'dev-code',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('rejects apple fallback callbacks without subject', async () => {
    const start = service.createOAuthStart('apple');

    await expect(
      service.completeAppleOAuth({
        state: start.state,
        code: 'dev-code',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('parses apple user email payloads from the callback user field', async () => {
    const start = service.createOAuthStart('apple');
    const callback = await service.completeAppleOAuth({
      state: start.state,
      code: 'apple-code',
      sub: 'apple-user-json',
      user: JSON.stringify({ email: '  Parsed@Example.com  ' }),
    });

    expect(callback.user.email).toBe('parsed@example.com');
  });

  it('ignores malformed apple user payloads', async () => {
    const start = service.createOAuthStart('apple');
    const callback = await service.completeAppleOAuth({
      state: start.state,
      code: 'apple-code',
      sub: 'apple-user-malformed',
      user: 'not-json',
    });

    expect(callback.user.email).toBe('apple-user-malformed@apple.private');
  });

  it('rejects google account conflicts when subject and email map to different users', async () => {
    service.register('google-a@example.com');
    const other = service.register('google-b@example.com');

    const firstStart = service.createOAuthStart('google');
    await service.completeGoogleOAuth({
      state: firstStart.state,
      code: 'oauth-code-1',
      email: 'google-b@example.com',
      sub: 'google-subject-conflict',
    });

    const secondStart = service.createOAuthStart('google');
    await expect(
      service.completeGoogleOAuth({
        state: secondStart.state,
        code: 'oauth-code-2',
        email: 'google-a@example.com',
        sub: 'google-subject-conflict',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });

    expect(other.user.id).toBeDefined();
  });

  it('rejects replayed oauth state and provider mismatches', async () => {
    const googleStart = service.createOAuthStart('google');

    await service.completeGoogleOAuth({
      state: googleStart.state,
      code: 'oauth-code-1',
      email: 'oauth-replay@example.com',
      sub: 'google-replay-subject',
    });

    await expect(
      service.completeGoogleOAuth({
        state: googleStart.state,
        code: 'oauth-code-2',
        email: 'oauth-replay@example.com',
        sub: 'google-replay-subject',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });

    const appleStart = service.createOAuthStart('apple');
    await expect(
      service.completeGoogleOAuth({
        state: appleStart.state,
        code: 'oauth-code-3',
        email: 'oauth-replay@example.com',
        sub: 'google-replay-subject',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('rejects replayed webauthn registration challenges', async () => {
    const registerOptions = await service.createWebAuthnRegisterOptions(
      'challenge-reuse@example.com',
    );

    await service.verifyWebAuthnRegistration({
      email: 'challenge-reuse@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-reuse-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    await expect(
      service.verifyWebAuthnRegistration({
        email: 'purpose-mismatch@example.com',
        challengeId: registerOptions.challenge_id,
        challenge: registerOptions.challenge,
        credentialId: 'cred-purpose-mismatch',
        publicKey: 'public-key-value',
        signCount: 10,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('rejects webauthn login challenges when used for registration', async () => {
    const registerOptions = await service.createWebAuthnRegisterOptions(
      'challenge-reuse@example.com',
    );
    await service.verifyWebAuthnRegistration({
      email: 'challenge-reuse@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-reuse-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    const loginChallenge = await service.createWebAuthnLoginOptions(
      'challenge-reuse@example.com',
    );
    await expect(
      service.verifyWebAuthnRegistration({
        email: 'purpose-mismatch@example.com',
        challengeId: loginChallenge.challenge_id,
        challenge: loginChallenge.challenge,
        credentialId: 'cred-purpose-mismatch',
        publicKey: 'public-key-value',
        signCount: 10,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('rejects legacy webauthn registration when challenge or credential fields are invalid', async () => {
    const options = await service.createWebAuthnRegisterOptions(
      'legacy-invalid@example.com',
    );

    await expect(
      service.verifyWebAuthnRegistration({
        email: 'legacy-invalid@example.com',
        challengeId: options.challenge_id,
        challenge: 'wrong-challenge',
        credentialId: 'cred-invalid',
        publicKey: 'public-key-value',
        signCount: 1,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });

    const negativeSignCountOptions =
      await service.createWebAuthnRegisterOptions(
        'legacy-negative@example.com',
      );
    await expect(
      service.verifyWebAuthnRegistration({
        email: 'legacy-negative@example.com',
        challengeId: negativeSignCountOptions.challenge_id,
        challenge: negativeSignCountOptions.challenge,
        credentialId: 'cred-negative',
        publicKey: 'public-key-value',
        signCount: -1,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('rejects apple account email conflicts for an already mapped subject', async () => {
    const firstStart = service.createOAuthStart('apple');
    await service.completeAppleOAuth({
      state: firstStart.state,
      code: 'apple-code-1',
      sub: 'apple-conflict-subject',
    });

    service.register('conflict@example.com');

    const secondStart = service.createOAuthStart('apple');
    await expect(
      service.completeAppleOAuth({
        state: secondStart.state,
        code: 'apple-code-2',
        sub: 'apple-conflict-subject',
        email: 'conflict@example.com',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
  });

  it('rejects duplicate passkey credentials during registration', async () => {
    const options = await service.createWebAuthnRegisterOptions(
      'duplicate-cred@example.com',
    );
    await service.verifyWebAuthnRegistration({
      email: 'duplicate-cred@example.com',
      challengeId: options.challenge_id,
      challenge: options.challenge,
      credentialId: 'cred-duplicate',
      publicKey: 'public-key-value',
      signCount: 1,
      transports: ['internal', 'invalid-transport'],
    });

    const secondOptions = await service.createWebAuthnRegisterOptions(
      'duplicate-cred-2@example.com',
    );
    await expect(
      service.verifyWebAuthnRegistration({
        email: 'duplicate-cred-2@example.com',
        challengeId: secondOptions.challenge_id,
        challenge: secondOptions.challenge,
        credentialId: 'cred-duplicate',
        publicKey: 'public-key-value',
        signCount: 1,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
  });

  it('updates base currency on profile changes', () => {
    const registration = service.register('profile-currency@example.com');

    const updated = service.updateProfileBySessionToken(
      registration.access_token,
      {
        base_currency: 'USD',
      },
    );

    expect(updated.base_currency).toBe('USD');
  });

  it('rejects configured google oauth when provider code exchange fails', async () => {
    const configuredService = new AuthService(
      createConfig({
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
        googleRedirectUri:
          'http://localhost:4000/api/auth/oauth/google/callback',
      }),
      createPrismaMock(),
    );
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({
          error: 'invalid_grant',
          error_description: 'Code expired',
        }),
    } as Response);

    const start = configuredService.createOAuthStart('google');
    await expect(
      configuredService.completeGoogleOAuth({
        state: start.state,
        code: 'expired-code',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });

    fetchMock.mockRestore();
  });

  it('rejects configured google oauth when the provider code is missing', async () => {
    const configuredService = new AuthService(
      createConfig({
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
        googleRedirectUri:
          'http://localhost:4000/api/auth/oauth/google/callback',
      }),
      createPrismaMock(),
    );
    const start = configuredService.createOAuthStart('google');

    await expect(
      configuredService.completeGoogleOAuth({
        state: start.state,
        code: '   ',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
    });
  });

  it('maps google provider network failures to internal errors', async () => {
    const configuredService = new AuthService(
      createConfig({
        googleClientId: 'google-client',
        googleClientSecret: 'google-secret',
        googleRedirectUri:
          'http://localhost:4000/api/auth/oauth/google/callback',
      }),
      createPrismaMock(),
    );
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('network down'));
    const start = configuredService.createOAuthStart('google');

    await expect(
      configuredService.completeGoogleOAuth({
        state: start.state,
        code: 'real-google-code',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.INTERNAL_ERROR,
    });

    fetchMock.mockRestore();
  });

  it('ignores apple user payloads without an email field', async () => {
    const start = service.createOAuthStart('apple');
    const callback = await service.completeAppleOAuth({
      state: start.state,
      code: 'apple-code',
      sub: 'apple-user-no-email',
      user: JSON.stringify({ name: 'No Email User' }),
    });

    expect(callback.user.email).toBe('apple-user-no-email@apple.private');
  });

  it('rejects oauth starts in production when provider credentials are missing', () => {
    const productionService = new AuthService(
      createConfig(undefined, { nodeEnv: 'production' }),
      createPrismaMock(),
    );

    expect(() => productionService.createOAuthStart('google')).toThrow(
      DomainError,
    );
    expect(() => productionService.createOAuthStart('apple')).toThrow(
      DomainError,
    );
  });
});
