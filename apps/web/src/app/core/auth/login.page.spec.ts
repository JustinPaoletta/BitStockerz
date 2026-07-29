import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPage, safeReturnUrl } from './login.page';

describe('safeReturnUrl', () => {
  it('accepts only internal absolute paths', () => {
    expect(safeReturnUrl('/backtests/123?tab=trades')).toBe('/backtests/123?tab=trades');
    expect(safeReturnUrl(null)).toBe('/backtests');
    expect(safeReturnUrl('https://example.com')).toBe('/backtests');
    expect(safeReturnUrl('//example.com')).toBe('/backtests');
  });
});

describe('LoginPage', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'backtests', component: LoginPage }]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('prevents native form navigation and logs in through the API', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'user@example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const submitEvent = new Event('submit', {
      bubbles: true,
      cancelable: true,
    });
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({ access_token: 'test-token' });
    await fixture.whenStable();

    expect(sessionStorage.getItem('bs.access_token')).toBe('test-token');
    expect(TestBed.inject(Router).url).toBe('/backtests');
  });
});
