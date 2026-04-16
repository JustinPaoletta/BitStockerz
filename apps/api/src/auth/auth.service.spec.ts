import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import { AuthService } from './auth.service';

function createConfig(overrides?: Partial<AppConfigService['auth']>): AppConfigService {
  return {
    server: {
      nodeEnv: 'test',
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

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService(createConfig());
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

    const updated = service.updateProfileBySessionToken(registration.access_token, {
      display_name: '  Trader Joe  ',
      base_currency: 'USD',
    });

    expect(updated.display_name).toBe('Trader Joe');
    expect(updated.base_currency).toBe('USD');
  });

  it('clears display name when updated with blank spaces', () => {
    const registration = service.register('user@example.com', 'Named User');

    const updated = service.updateProfileBySessionToken(registration.access_token, {
      display_name: '   ',
    });

    expect(updated.display_name).toBeUndefined();
  });

  it('invalidates tokens on logout', () => {
    const registration = service.register('user@example.com');
    service.logout(registration.access_token);

    expect(() => service.getProfileBySessionToken(registration.access_token)).toThrow(DomainError);
  });

  it('creates and verifies a webauthn registration flow', async () => {
    const options = await service.createWebAuthnRegisterOptions('passkey@example.com');

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
    const options = await service.createWebAuthnRegisterOptions('passkey@example.com');

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
    const registerOptions = await service.createWebAuthnRegisterOptions('login@example.com');
    await service.verifyWebAuthnRegistration({
      email: 'login@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-login-1',
      publicKey: 'public-key-value',
      signCount: 10,
    });

    const loginOptions = await service.createWebAuthnLoginOptions('login@example.com');
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
    const registerOptions = await service.createWebAuthnRegisterOptions('counter@example.com');
    await service.verifyWebAuthnRegistration({
      email: 'counter@example.com',
      challengeId: registerOptions.challenge_id,
      challenge: registerOptions.challenge,
      credentialId: 'cred-counter-1',
      publicKey: 'public-key-value',
      signCount: 50,
    });

    const loginOptions = await service.createWebAuthnLoginOptions('counter@example.com');

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

    const shortTtlService = new AuthService(createConfig({ sessionTtlSeconds: 1 }));
    const registration = shortTtlService.register('ttl@example.com');

    jest.advanceTimersByTime(1100);

    expect(() => shortTtlService.getProfileBySessionToken(registration.access_token)).toThrow(
      DomainError,
    );

    jest.useRealTimers();
  });
});
