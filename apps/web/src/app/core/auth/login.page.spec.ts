import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { LoginPage } from './login.page';
import { environment } from '../../../environments/environment';
import { AuthService, safeReturnUrl } from './auth.service';
import { TokenStorageService } from './token-storage.service';

describe('safeReturnUrl', () => {
  it('accepts only internal absolute paths', () => {
    expect(safeReturnUrl('/backtests/123?tab=trades')).toBe('/backtests/123?tab=trades');
    expect(safeReturnUrl(null)).toBe('/dashboard');
    expect(safeReturnUrl('https://example.com')).toBe('/dashboard');
    expect(safeReturnUrl('//example.com')).toBe('/dashboard');
    expect(safeReturnUrl('/\\example.com')).toBe('/dashboard');
    expect(safeReturnUrl('/%2fexample.com')).toBe('/dashboard');
    expect(safeReturnUrl('/%5cexample.com')).toBe('/dashboard');
    expect(safeReturnUrl('/path\n')).toBe('/dashboard');
    expect(safeReturnUrl('/%00')).toBe('/dashboard');
    expect(safeReturnUrl('/%invalid')).toBe('/dashboard');
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
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/providers')
      .flush({ google: false, apple: false });
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    input.value = 'user@example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const fallbackButton = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Sign in for local testing'));
    expect(fallbackButton).toBeTruthy();
    fallbackButton!.click();

    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/login')
      .flush({
        access_token: 'test-token',
        user: { id: '1', email: 'user@example.com', display_name: 'User' },
      });
    await Promise.resolve();
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/me')
      .flush({
        id: '1',
        email: 'user@example.com',
        display_name: 'User',
        passkey_count: 0,
        linked_auth_methods: { passkeys: false, google: false, apple: false },
      });
    await fixture.whenStable();

    expect(sessionStorage.getItem('bs.access_token')).toBe('test-token');
    expect(TestBed.inject(Router).url).toBe('/dashboard');
  });

  it('shows only configured providers and explains the lost-device path', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/providers')
      .flush({ google: true, apple: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Continue with Google');
    expect(fixture.nativeElement.textContent).not.toContain('Continue with Apple');
    expect(fixture.nativeElement.textContent).toContain('previously linked to BitStockerz');
    expect(fixture.nativeElement.textContent).toContain(
      'email address alone cannot prove account ownership',
    );
  });

  it('shows sign-in and registration instructions only in their matching modes', async () => {
    const fixture = TestBed.createComponent(LoginPage);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/auth/providers')
      .flush({ google: false, apple: false });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#display')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Enter your email, then use your passkey');
    expect(fixture.nativeElement.textContent).not.toContain('create a passkey');
    expect(fixture.nativeElement.textContent).toContain('Test your ideas.');
    expect(fixture.nativeElement.textContent).not.toContain('Create a local test account');

    const create = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes('Create an account'));
    create?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#display')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Create your account');
    expect(fixture.nativeElement.textContent).toContain('then create a passkey');
    expect(fixture.nativeElement.textContent).toContain('Create account with a passkey');
    expect(fixture.nativeElement.textContent).toContain('Create a local test account');
    expect(fixture.nativeElement.textContent).not.toContain('Sign in for local testing');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Enter your email, then use your passkey',
    );
  });

  it('keeps verification sign-in usable while an existing session is present', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: { queryParamMap: convertToParamMap({ reauth: '1', returnUrl: '/profile' }) },
      },
    });
    TestBed.inject(TokenStorageService).set('existing-token');
    const fixture = TestBed.createComponent(LoginPage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/auth/providers').flush({ google: false, apple: false });
    await fixture.whenStable();
    fixture.detectChanges();
    http.expectNone('/api/auth/me');
    expect(fixture.nativeElement.textContent).toContain('Verify your account');
    expect(fixture.nativeElement.textContent).not.toContain('Create an account');
    expect(fixture.nativeElement.textContent).not.toContain('Create a local test account');
  });
});

describe('Personal Team test login', () => {
  const originalMode = environment.nativeMode;
  afterEach(() => {
    environment.nativeMode = originalMode;
  });

  it('uses a fictional account and keeps passkey controls out of the demo', async () => {
    environment.nativeMode = 'device-demo';
    const auth = {
      isAuthenticated: () => false,
      loginWithEmail: vi.fn().mockRejectedValue(new Error('not registered')),
      registerWithEmail: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Test login only');
    expect(fixture.nativeElement.textContent).not.toContain('Sign in with a passkey');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    fixture.nativeElement.querySelector('button').click();
    await fixture.whenStable();
    expect(auth.registerWithEmail).toHaveBeenCalledWith(
      'iphone-demo@example.invalid',
      'iPhone Demo',
    );
    expect(navigate).toHaveBeenCalledWith('/research');
  });
});
