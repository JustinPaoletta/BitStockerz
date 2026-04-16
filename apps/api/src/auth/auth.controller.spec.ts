import { AuthController } from './auth.controller';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthService } from './auth.service';

describe('AuthController', () => {
  it('registers users through the auth service', () => {
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
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const result = controller.register({
      email: 'user@example.com',
      display_name: 'User',
    });

    expect(registerMock).toHaveBeenCalledWith('user@example.com', 'User');
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

    const controller = new AuthController(authService);
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
    } as unknown as AuthService;

    const controller = new AuthController(authService);
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

    const controller = new AuthController(authService);
    const request = { authToken: 'token-4' } as unknown as AuthenticatedRequest;
    const profile = controller.me(request);

    expect(getProfileMock).toHaveBeenCalledWith('token-4');
    expect(profile).toEqual({ id: 'u1', email: 'user@example.com' });
  });

  it('starts and verifies webauthn registration', () => {
    const createOptionsMock = jest.fn(() => ({
      challenge_id: 'challenge-1',
      challenge: 'challenge-token',
      rp_id: 'localhost',
      rp_name: 'BitStockerz',
      timeout_ms: 300000,
      user_email: 'user@example.com',
    }));
    const verifyMock = jest.fn(() => ({
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
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const options = controller.webauthnRegisterOptions({ email: 'user@example.com' });
    const verify = controller.webauthnRegisterVerify({
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
    expect(options.challenge_id).toBe('challenge-1');
    expect(verify.token_type).toBe('Bearer');
  });

  it('starts oauth providers and handles callbacks', () => {
    const createOAuthStartMock = jest.fn((provider: 'google' | 'apple') => ({
      provider,
      state: `${provider}-state`,
      authorization_url: '/callback',
      expires_in_seconds: 300,
    }));
    const googleCallbackMock = jest.fn(() => ({
      access_token: 'token-google',
      token_type: 'Bearer',
      user: { id: 'u1', email: 'user@example.com' },
    }));
    const appleCallbackMock = jest.fn(() => ({
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
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const googleStart = controller.oauthGoogleStart();
    const appleStart = controller.oauthAppleStart();
    const googleCallback = controller.oauthGoogleCallback({
      state: 'g-state',
      code: 'g-code',
      email: 'user@example.com',
      sub: 'google-sub',
    });
    const appleCallback = controller.oauthAppleCallbackGet({
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
    expect(googleStart.provider).toBe('google');
    expect(appleStart.provider).toBe('apple');
    expect(googleCallback.access_token).toBe('token-google');
    expect(appleCallback.access_token).toBe('token-apple');
  });
});
