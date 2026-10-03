import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, OAUTH_NAVIGATE } from './auth.service';
import { TokenStorageService } from './token-storage.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let tokens: TokenStorageService;
  const navigate = vi.fn();
  const user = {
    id: 'u1',
    email: 'trader@example.com',
    display_name: 'Trader',
    base_currency: 'USD',
    linked_auth_methods: { passkeys: true, google: false, apple: false },
    passkey_count: 1,
  };

  beforeEach(() => {
    sessionStorage.clear();
    navigate.mockReset();
    window.history.replaceState(null, '', '/');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OAUTH_NAVIGATE, useValue: navigate },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStorageService);
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  it('stores the bearer token and user on email login', async () => {
    expect(auth.isAuthenticated()).toBe(false);

    const pending = auth.loginWithEmail('trader@example.com');
    http.expectOne('/api/auth/login').flush({
      access_token: 'token-1',
      user: { id: 'u1', email: 'trader@example.com', display_name: 'Trader' },
    });
    await Promise.resolve();
    http.expectOne('/api/auth/me').flush(user);
    await pending;

    expect(tokens.get()).toBe('token-1');
    expect(auth.user()?.email).toBe('trader@example.com');
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('clears local session state', () => {
    tokens.set('token-1');
    auth.clearSession();
    expect(tokens.get()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('maps RFC 7807 problem details into user-facing messages', () => {
    const error = new HttpErrorResponse({
      status: 429,
      error: { detail: 'Too many requests', code: 'RATE_LIMITED' },
    });
    expect(auth.problemMessage(error, 'fallback')).toBe('Too many requests');
  });

  it('probes /auth/me once when ensuring a session', async () => {
    tokens.set('token-1');
    const first = auth.ensureSession();
    const second = auth.ensureSession();
    http.expectOne('/api/auth/me').flush({
      id: 'u1',
      email: 'trader@example.com',
      display_name: 'Trader',
    });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it('clears the session when login returns a token but /auth/me fails', async () => {
    const pending = auth.loginWithEmail('trader@example.com');
    http.expectOne('/api/auth/login').flush({ access_token: 'token-1' });
    await Promise.resolve();
    http
      .expectOne('/api/auth/me')
      .flush({ detail: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await expect(pending).rejects.toThrow('session could not be loaded');
    expect(tokens.get()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.user()).toBeNull();
  });

  async function start(intent: 'login' | 'link' = 'login'): Promise<void> {
    const pending = auth.startOAuth('google', '/profile', intent);
    const request = await vi.waitFor(() =>
      http.expectOne(`/api/auth/oauth/google/${intent === 'link' ? 'link' : 'browser'}/start`),
    );
    expect(request.request.body.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    request.flush({
      provider: 'google',
      state: 'oauth-state',
      authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=oauth-state',
      expires_in_seconds: 300,
    });
    await pending;
  }

  async function signedIn(): Promise<void> {
    tokens.set('original-token');
    const pending = auth.getProfile();
    http.expectOne('/api/me').flush(user);
    await pending;
  }

  it('starts a verifier-bound browser flow without placing a bearer in its URL', async () => {
    await start();
    const flow = JSON.parse(sessionStorage.getItem('bs.oauth_flow')!);
    expect(flow.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(flow.returnPath).toBe('/profile');
    expect(flow.intent).toBe('login');
    expect(navigate).toHaveBeenCalledWith(expect.stringContaining('https://accounts.google.com/'));
    expect(navigate.mock.calls[0][0]).not.toContain('access_token');
  });

  it('scrubs callback credentials before exchange, hydrates the full profile, and clears the flow', async () => {
    await start();
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=oauth-state');
    const pending = auth.completeOAuthCallback();
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('bs.oauth_flow')).toBeNull();
    const request = http.expectOne('/api/auth/oauth/session/exchange');
    expect(request.request.body.code).toBe('one-use');
    expect(request.request.body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    request.flush({
      access_token: 'oauth-token',
      user,
      intent: 'login',
      return_path: '//external.example',
    });
    await Promise.resolve();
    http
      .expectOne('/api/auth/me')
      .flush({ ...user, linked_auth_methods: { ...user.linked_auth_methods, google: true } });
    await expect(pending).resolves.toEqual({ intent: 'login', returnPath: '/profile' });
    expect(tokens.get()).toBe('oauth-token');
    expect(auth.user()?.linked_auth_methods?.google).toBe(true);
    await expect(auth.completeOAuthCallback()).rejects.toThrow('already used');
  });

  it('rejects unmatched callback state without an HTTP exchange', async () => {
    await start();
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=wrong');
    await expect(auth.completeOAuthCallback()).rejects.toThrow('expired or was already used');
    http.expectNone('/api/auth/oauth/session/exchange');
    expect(window.location.hash).toBe('');
    expect(sessionStorage.getItem('bs.oauth_flow')).toBeNull();
  });

  it('rejects expired flow and malformed callback credentials', async () => {
    await start();
    const flow = JSON.parse(sessionStorage.getItem('bs.oauth_flow')!);
    sessionStorage.setItem('bs.oauth_flow', JSON.stringify({ ...flow, expiresAt: Date.now() - 1 }));
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=oauth-state');
    await expect(auth.completeOAuthCallback()).rejects.toThrow('expired');
    await start();
    window.history.replaceState(
      null,
      '',
      '/auth/oauth/callback#code=one-use&code=two&state=oauth-state',
    );
    await expect(auth.completeOAuthCallback()).rejects.toThrow('incomplete');
    http.expectNone('/api/auth/oauth/session/exchange');
  });

  it('keeps the signed-in account on a cancelled link', async () => {
    await signedIn();
    await start('link');
    window.history.replaceState(null, '', '/auth/oauth/callback#error=cancelled&state=oauth-state');
    await expect(auth.completeOAuthCallback()).rejects.toThrow('cancelled');
    expect(tokens.get()).toBe('original-token');
    expect(auth.user()?.id).toBe('u1');
    expect(auth.user()?.linked_auth_methods?.google).toBe(false);
  });

  it('rejects linking when the initiating browser session has changed', async () => {
    await signedIn();
    await start('link');
    tokens.set('another-token');
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=oauth-state');
    await expect(auth.completeOAuthCallback()).rejects.toThrow('Sign in again');
    http.expectNone('/api/auth/oauth/session/exchange');
    expect(tokens.get()).toBe('another-token');
  });

  it('explains account conflicts and never echoes unknown provider error text', async () => {
    await start();
    window.history.replaceState(
      null,
      '',
      '/auth/oauth/callback#error=account_conflict&state=oauth-state',
    );
    await expect(auth.completeOAuthCallback()).rejects.toThrow('existing BitStockerz account');
    await start();
    window.history.replaceState(
      null,
      '',
      '/auth/oauth/callback#error=provider-secret-error&state=oauth-state',
    );
    await expect(auth.completeOAuthCallback()).rejects.toThrow(
      'Sign-in could not be completed. Start again.',
    );
    http.expectNone('/api/auth/oauth/session/exchange');
  });

  it('refreshes profile after linking without replacing the initiating bearer', async () => {
    await signedIn();
    await start('link');
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=oauth-state');
    const pending = auth.completeOAuthCallback();
    const request = await vi.waitFor(() => http.expectOne('/api/auth/oauth/session/exchange'));
    request.flush({
      access_token: 'original-token',
      user: { ...user, linked_auth_methods: { ...user.linked_auth_methods, google: true } },
      intent: 'link',
      return_path: '/profile',
    });
    await Promise.resolve();
    http
      .expectOne('/api/me')
      .flush({ ...user, linked_auth_methods: { ...user.linked_auth_methods, google: true } });
    await expect(pending).resolves.toEqual({ intent: 'link', returnPath: '/profile' });
    expect(tokens.get()).toBe('original-token');
    expect(auth.user()?.linked_auth_methods?.google).toBe(true);
  });

  it('preserves the session when a link exchange conflicts', async () => {
    await signedIn();
    await start('link');
    window.history.replaceState(null, '', '/auth/oauth/callback#code=one-use&state=oauth-state');
    const pending = auth.completeOAuthCallback();
    const rejected = expect(pending).rejects.toBeInstanceOf(HttpErrorResponse);
    const request = await vi.waitFor(() => http.expectOne('/api/auth/oauth/session/exchange'));
    request.flush(
      { detail: 'Identity belongs to another account.' },
      { status: 409, statusText: 'Conflict' },
    );
    await rejected;
    expect(tokens.get()).toBe('original-token');
    expect(auth.user()?.linked_auth_methods?.google).toBe(false);
  });
});
