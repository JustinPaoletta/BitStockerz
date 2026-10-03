import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiBaseInterceptor } from '../api/api-base.interceptor';
import { authInterceptor } from './auth.interceptor';
import { TokenStorageService } from './token-storage.service';

describe('authInterceptor', () => {
  const originalApiBaseUrl = environment.apiBaseUrl;
  const navigate = vi.fn().mockResolvedValue(true);
  beforeEach(() => {
    sessionStorage.clear();
    environment.apiBaseUrl = '';
    navigate.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseInterceptor, authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { url: '/profile', navigate } },
      ],
    });
    TestBed.inject(TokenStorageService).set('initiating-token');
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
    environment.apiBaseUrl = originalApiBaseUrl;
  });

  it('sends the initiating bearer and preserves it for rejected link exchanges', async () => {
    const pending = firstValueFrom(
      TestBed.inject(HttpClient).post('/api/auth/oauth/session/exchange', {
        code: 'one-use',
        verifier: 'verifier',
      }),
    );
    const rejected = expect(pending).rejects.toBeTruthy();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/oauth/session/exchange',
    );
    expect(request.request.headers.get('Authorization')).toBe('Bearer initiating-token');
    request.flush({ detail: 'Sign in again.' }, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(TestBed.inject(TokenStorageService).get()).toBe('initiating-token');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses the normal expired-session path for protected profile requests', async () => {
    const pending = firstValueFrom(
      TestBed.inject(HttpClient).patch('/api/me', { display_name: 'Trader' }),
    );
    const rejected = expect(pending).rejects.toBeTruthy();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(TestBed.inject(TokenStorageService).get()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/profile' } });
  });

  it('attaches the bearer to configured API calls after base URL rewriting', async () => {
    environment.apiBaseUrl = 'https://api.example.test';
    const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/me'));
    const request = TestBed.inject(HttpTestingController).expectOne(
      'https://api.example.test/api/me',
    );
    expect(request.request.headers.has('Authorization')).toBe(true);
    request.flush({});
    await pending;
  });

  it('preserves the original session on a configured API linking failure', async () => {
    environment.apiBaseUrl = 'https://api.example.test';
    const pending = firstValueFrom(
      TestBed.inject(HttpClient).post('/api/auth/oauth/google/link/start', {}),
    );
    const rejected = expect(pending).rejects.toBeTruthy();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'https://api.example.test/api/auth/oauth/google/link/start',
    );
    expect(request.request.headers.has('Authorization')).toBe(true);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(TestBed.inject(TokenStorageService).hasToken()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    'https://collector.example.test/api/me',
    '//collector.example.test/api/me',
    '/assets/account.json',
    '/apiary',
    '/api%2Fme',
    '/api/../../assets/account.json',
    'http://[invalid',
  ])(
    'does not attach a bearer or expire the session for an untrusted destination: %s',
    async (url) => {
      const pending = firstValueFrom(TestBed.inject(HttpClient).get(url));
      const rejected = expect(pending).rejects.toBeTruthy();
      const request = TestBed.inject(HttpTestingController).expectOne(url);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({}, { status: 401, statusText: 'Unauthorized' });
      await rejected;
      expect(TestBed.inject(TokenStorageService).hasToken()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it.each([
    'http://api.example.test/api/me',
    'https://api.example.test:444/api/me',
    'https://api.example.test/api-private/me',
    'https://api.example.test/assets/account.json',
    'https://userinfo@api.example.test/api/me',
  ])('rejects destinations outside the configured API origin/path: %s', async (url) => {
    environment.apiBaseUrl = 'https://api.example.test';
    const pending = firstValueFrom(TestBed.inject(HttpClient).get(url));
    const request = TestBed.inject(HttpTestingController).expectOne(url);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
    await pending;
  });

  it('fails closed if the configured API origin is malformed', async () => {
    environment.apiBaseUrl = 'invalid-base';
    const pending = firstValueFrom(
      TestBed.inject(HttpClient).get('https://api.example.test/api/me'),
    );
    const request = TestBed.inject(HttpTestingController).expectOne(
      'https://api.example.test/api/me',
    );
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
    await pending;
  });
});
