import type { AuditService } from '../observability/audit.service';
import { AuthController } from './auth.controller';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  it('registers users and awaits paper-account provisioning', async () => {
    const registerMock = jest.fn(() => ({
      access_token: 'token-1',
      token_type: 'Bearer',
      user: { id: 'u1' },
    }));

    const authService = {
      register: registerMock,
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
      ensurePaperAccountForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const result = await controller.register({
      email: 'user@example.com',
      display_name: 'User',
    });

    expect(registerMock).toHaveBeenCalledWith('user@example.com', 'User');
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledWith('u1');
    expect(result.access_token).toBe('token-1');
  });

  it('logs in users through the auth service', () => {
    const loginMock = jest.fn(() => ({
      access_token: 'token-2',
      token_type: 'Bearer',
      user: { id: 'u1' },
    }));

    const authService = {
      register: jest.fn(),
      login: loginMock,
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const result = controller.login({ email: 'user@example.com' });

    expect(loginMock).toHaveBeenCalledWith('user@example.com');
    expect(result.token_type).toBe('Bearer');
  });

  it('logs out authenticated sessions', () => {
    const logoutMock = jest.fn();
    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: logoutMock,
      getProfileBySessionToken: jest.fn(),
      requireUserBySessionToken: jest.fn().mockReturnValue({
        id: 'u1',
        email: 'user@example.com',
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const request = { authToken: 'token-3' } as unknown as AuthenticatedRequest;
    const response = controller.logout(request);

    expect(logoutMock).toHaveBeenCalledWith('token-3');
    expect(response).toEqual({ status: 'ok' });
  });

  it('returns profile for authenticated users', () => {
    const getProfileMock = jest.fn(() => ({
      id: 'u1',
      email: 'user@example.com',
    }));

    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: getProfileMock,
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const request = { authToken: 'token-4' } as unknown as AuthenticatedRequest;
    const profile = controller.me(request);

    expect(getProfileMock).toHaveBeenCalledWith('token-4');
    expect(profile).toEqual({ id: 'u1', email: 'user@example.com' });
  });

  it('starts and verifies webauthn registration', async () => {
    const createOptionsMock = jest.fn(() => ({
      challenge_id: 'challenge-1',
      challenge: 'challenge-token',
      rp_id: 'localhost',
      rp_name: 'BitStockerz',
      timeout_ms: 300000,
      user_email: 'user@example.com',
    }));
    const verifyMock = jest.fn(async () => ({
      access_token: 'token-1',
      token_type: 'Bearer',
      user: { id: 'u1', email: 'user@example.com' },
    }));

    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
      createWebAuthnRegisterOptions: createOptionsMock,
      verifyWebAuthnRegistration: verifyMock,
      ensurePaperAccountForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const options = await controller.webauthnRegisterOptions({
      email: 'user@example.com',
    });
    const verify = await controller.webauthnRegisterVerify({
      email: 'user@example.com',
      challenge_id: 'challenge-1',
      challenge: 'challenge-token',
      credential_id: 'cred-1',
      public_key: 'public-key',
      sign_count: 1,
    });

    expect(createOptionsMock).toHaveBeenCalledWith('user@example.com');
    expect(verifyMock).toHaveBeenCalledWith({
      email: 'user@example.com',
      challengeId: 'challenge-1',
      challenge: 'challenge-token',
      credentialId: 'cred-1',
      publicKey: 'public-key',
      signCount: 1,
      transports: undefined,
      aaguid: undefined,
      displayName: undefined,
      response: undefined,
    });
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledWith('u1');
    expect(options.challenge_id).toBe('challenge-1');
    expect(verify.token_type).toBe('Bearer');
  });

  it('starts oauth providers and handles callbacks', async () => {
    const createOAuthStartMock = jest.fn((provider: 'google' | 'apple') => ({
      provider,
      state: `${provider}-state`,
      authorization_url: '/callback',
      expires_in_seconds: 300,
    }));
    const googleCallbackMock = jest.fn(async () => ({
      access_token: 'token-google',
      token_type: 'Bearer',
      user: { id: 'u1', email: 'user@example.com' },
    }));
    const appleCallbackMock = jest.fn(async () => ({
      access_token: 'token-apple',
      token_type: 'Bearer',
      user: { id: 'u2', email: 'apple@example.com' },
    }));

    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
      createOAuthStart: createOAuthStartMock,
      completeGoogleOAuth: googleCallbackMock,
      completeAppleOAuth: appleCallbackMock,
      ensurePaperAccountForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const googleStart = controller.oauthGoogleStart();
    const appleStart = controller.oauthAppleStart();
    const googleCallback = await controller.oauthGoogleCallback({
      state: 'g-state',
      code: 'g-code',
      email: 'user@example.com',
      sub: 'google-sub',
    });
    const appleCallback = await controller.oauthAppleCallbackGet({
      state: 'a-state',
      code: 'a-code',
      sub: 'apple-sub',
      email: 'apple@example.com',
      user: '{"email":"apple@example.com"}',
    });

    expect(createOAuthStartMock).toHaveBeenCalledWith('google');
    expect(createOAuthStartMock).toHaveBeenCalledWith('apple');
    expect(googleCallbackMock).toHaveBeenCalledWith({
      state: 'g-state',
      code: 'g-code',
      email: 'user@example.com',
      sub: 'google-sub',
    });
    expect(appleCallbackMock).toHaveBeenCalledWith({
      state: 'a-state',
      code: 'a-code',
      sub: 'apple-sub',
      email: 'apple@example.com',
      user: '{"email":"apple@example.com"}',
    });
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledWith('u1');
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledWith('u2');
    expect(googleStart.provider).toBe('google');
    expect(appleStart.provider).toBe('apple');
    expect(googleCallback.access_token).toBe('token-google');
    expect(appleCallback.access_token).toBe('token-apple');

    const applePost = await controller.oauthAppleCallbackPost({
      state: 'a-state-2',
      code: 'a-code-2',
      sub: 'apple-sub-2',
      email: 'apple2@example.com',
    });
    expect(applePost.access_token).toBe('token-apple');
    expect(appleCallbackMock).toHaveBeenCalledWith({
      state: 'a-state-2',
      code: 'a-code-2',
      sub: 'apple-sub-2',
      email: 'apple2@example.com',
      user: undefined,
    });
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledTimes(3);
  });

  it('starts and verifies webauthn login flows', async () => {
    const createLoginOptionsMock = jest.fn(() => ({
      challenge_id: 'login-challenge-1',
      challenge: 'login-challenge-token',
      timeout_ms: 300000,
      user_email: 'login@example.com',
      allow_credentials: ['cred-login-1'],
      options: {},
    }));
    const verifyLoginMock = jest.fn(() => ({
      access_token: 'token-login',
      token_type: 'Bearer',
      user: { id: 'u3', email: 'login@example.com' },
    }));

    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
      createWebAuthnLoginOptions: createLoginOptionsMock,
      verifyWebAuthnLogin: verifyLoginMock,
    } as unknown as AuthService;

    const controller = new AuthController(authService, audit);
    const options = await controller.webauthnLoginOptions({
      email: 'login@example.com',
    });
    const verify = await controller.webauthnLoginVerify({
      email: 'login@example.com',
      challenge_id: 'login-challenge-1',
      challenge: 'login-challenge-token',
      credential_id: 'cred-login-1',
      sign_count: 12,
      response: { id: 'cred-login-1' },
    });

    expect(createLoginOptionsMock).toHaveBeenCalledWith('login@example.com');
    expect(verifyLoginMock).toHaveBeenCalledWith({
      email: 'login@example.com',
      challengeId: 'login-challenge-1',
      challenge: 'login-challenge-token',
      credentialId: 'cred-login-1',
      signCount: 12,
      response: { id: 'cred-login-1' },
    });
    expect(options.challenge_id).toBe('login-challenge-1');
    expect(verify.access_token).toBe('token-login');
  });

  it('handles apple oauth post callbacks', async () => {
    const appleCallbackMock = jest.fn(async () => ({
      access_token: 'token-apple-post',
      token_type: 'Bearer',
      user: { id: 'u4', email: 'apple-post@example.com' },
    }));
    const authService = {
      register: jest.fn(),
      login: jest.fn(),
      logout: jest.fn(),
      getProfileBySessionToken: jest.fn(),
      completeAppleOAuth: appleCallbackMock,
      ensurePaperAccountForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;
    const controller = new AuthController(authService, audit);

    const callback = await controller.oauthAppleCallbackPost({
      state: 'apple-post-state',
      code: 'apple-post-code',
      sub: 'apple-post-sub',
      email: 'apple-post@example.com',
      user: '{"email":"apple-post@example.com"}',
    });

    expect(appleCallbackMock).toHaveBeenCalledWith({
      state: 'apple-post-state',
      code: 'apple-post-code',
      sub: 'apple-post-sub',
      email: 'apple-post@example.com',
      user: '{"email":"apple-post@example.com"}',
    });
    expect(authService.ensurePaperAccountForUser).toHaveBeenCalledWith('u4');
    expect(callback.access_token).toBe('token-apple-post');
  });

  it('throws unauthorized when auth token is missing from request context', () => {
    const controller = new AuthController(
      {
        getProfileBySessionToken: jest.fn(),
      } as unknown as AuthService,
      audit,
    );

    expect(() => controller.me({} as unknown as AuthenticatedRequest)).toThrow(
      'Authentication is required.',
    );
  });
});
