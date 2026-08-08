import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPage } from './login.page';
import { safeReturnUrl } from './auth.service';

describe('safeReturnUrl', () => {
  it('accepts only internal absolute paths', () => {
    expect(safeReturnUrl('/backtests/123?tab=trades')).toBe('/backtests/123?tab=trades');
    expect(safeReturnUrl(null)).toBe('/dashboard');
    expect(safeReturnUrl('https://example.com')).toBe('/dashboard');
    expect(safeReturnUrl('//example.com')).toBe('/dashboard');
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
        provideRouter([{ path: 'dashboard', component: LoginPage }]),
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
  });

  it('logs in through the email fallback', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    input.value = 'user@example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const fallbackButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Email log in'));
    expect(fallbackButton).toBeTruthy();
    fallbackButton!.click();

    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({
        access_token: 'test-token',
        user: { id: '1', email: 'user@example.com', display_name: 'User' },
      });
    await fixture.whenStable();

    expect(sessionStorage.getItem('bs.access_token')).toBe('test-token');
    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });
});
