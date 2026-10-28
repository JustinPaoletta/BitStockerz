import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiBaseInterceptor } from './api-base.interceptor';

describe('apiBaseInterceptor', () => {
  const originalApiBaseUrl = environment.apiBaseUrl;
  const originalMode = environment.nativeMode;
  beforeEach(() => {
    environment.apiBaseUrl = 'https://api.example.test/';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    environment.apiBaseUrl = originalApiBaseUrl;
    environment.nativeMode = originalMode;
    environment.prototypeAccessKey = undefined;
  });

  it.each(['/api', '/api?version=1', '/api/me', '/api/trading/orders'])(
    'rewrites local API paths: %s',
    async (url) => {
      const pending = firstValueFrom(TestBed.inject(HttpClient).get(url));
      TestBed.inject(HttpTestingController).expectOne(`https://api.example.test${url}`).flush({});
      await pending;
    },
  );

  it.each([
    '/apiary',
    '/api-private',
    '/api%2Fme',
    '/api/../assets/account.json',
    '/assets/theme.json',
    '//collector.example.test/api/me',
    'https://api.example.test/api/me',
  ])('does not rewrite a non-API or non-local destination: %s', async (url) => {
    const pending = firstValueFrom(TestBed.inject(HttpClient).get(url));
    TestBed.inject(HttpTestingController).expectOne(url).flush({});
    await pending;
  });

  it('rewrites API calls from the opaque Capacitor origin', async () => {
    vi.stubGlobal('window', { location: new URL('capacitor://localhost/login') });
    try {
      const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/me'));
      TestBed.inject(HttpTestingController).expectOne('https://api.example.test/api/me').flush({});
      await pending;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adds the demo key only to relative API requests in explicit demo mode', async () => {
    environment.nativeMode = 'device-demo';
    environment.prototypeAccessKey = 'disposable-test-key';
    for (const url of ['/api/me', 'https://collector.example.test/api/me', '/assets/theme.json']) {
      const pending = firstValueFrom(TestBed.inject(HttpClient).get(url));
      const request = TestBed.inject(HttpTestingController).expectOne(
        url === '/api/me' ? 'https://api.example.test/api/me' : url,
      );
      expect(request.request.headers.get('x-bitstockerz-beta-key')).toBe(
        url === '/api/me' ? 'disposable-test-key' : null,
      );
      request.flush({});
      await pending;
    }
    environment.nativeMode = 'device';
    const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/me'));
    const request = TestBed.inject(HttpTestingController).expectOne(
      'https://api.example.test/api/me',
    );
    expect(request.request.headers.has('x-bitstockerz-beta-key')).toBe(false);
    request.flush({});
    await pending;
  });

  it('keeps same-origin API calls when no API base is configured', async () => {
    environment.apiBaseUrl = '';
    const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/me'));
    TestBed.inject(HttpTestingController).expectOne('/api/me').flush({});
    await pending;
  });
});
