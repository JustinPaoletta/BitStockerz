import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let tokens: TokenStorageService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
});
