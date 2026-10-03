import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { apiBaseInterceptor } from './api-base.interceptor';

describe('apiBaseInterceptor', () => {
  const originalApiBaseUrl = environment.apiBaseUrl;
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

  it('keeps same-origin API calls when no API base is configured', async () => {
    environment.apiBaseUrl = '';
    const pending = firstValueFrom(TestBed.inject(HttpClient).get('/api/me'));
    TestBed.inject(HttpTestingController).expectOne('/api/me').flush({});
    await pending;
  });
});
