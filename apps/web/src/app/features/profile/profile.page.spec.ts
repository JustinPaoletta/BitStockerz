import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService, OAUTH_NAVIGATE } from '../../core/auth/auth.service';
import { TokenStorageService } from '../../core/auth/token-storage.service';
import { ProfilePage } from './profile.page';

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let http: HttpTestingController;
  const user = {
    id: 'u1',
    email: 'trader@example.com',
    display_name: 'Trader',
    base_currency: 'USD',
    passkey_count: 1,
    linked_auth_methods: { passkeys: true, google: false, apple: false },
  };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [ProfilePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OAUTH_NAVIGATE, useValue: vi.fn() },
      ],
    }).compileComponents();
    TestBed.inject(TokenStorageService).set('account-token');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePage);
    http.expectOne('/api/me').flush(user);
    http.expectOne('/api/auth/providers').flush({ google: true, apple: false });
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  function fillName(value: string): void {
    const input = fixture.nativeElement.querySelector('#profile-name') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  function submit(): void {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  }

  it('shows immutable email/USD and recovery readiness with only available actions', () => {
    const email = fixture.nativeElement.querySelector('#profile-email') as HTMLInputElement;
    expect(email.readOnly).toBe(true);
    expect(email.value).toBe(user.email);
    expect(fixture.nativeElement.textContent).toContain('1 registered');
    expect(fixture.nativeElement.textContent).toContain('no linked recovery provider');
    expect(fixture.nativeElement.textContent).toContain('Link Google');
    expect(fixture.nativeElement.textContent).not.toContain('Link Apple');
    expect(fixture.nativeElement.querySelector('#profile-currency').value).toBe('USD');
  });

  it('saves a trimmed name and updates the shared shell profile', async () => {
    fillName('  New Trader  ');
    submit();
    const request = http.expectOne('/api/me');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ display_name: 'New Trader' });
    request.flush({ ...user, display_name: 'New Trader' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Profile saved.');
    expect(TestBed.inject(AuthService).user()?.display_name).toBe('New Trader');
    expect(fixture.nativeElement.querySelector('#profile-name').value).toBe('New Trader');
  });

  it('retains edits after a failed save and supports retry', async () => {
    fillName('Unsaved Trader');
    submit();
    http
      .expectOne('/api/me')
      .flush({ detail: 'Please retry.' }, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#profile-name').value).toBe('Unsaved Trader');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Please retry.',
    );
    submit();
    http.expectOne('/api/me').flush({ ...user, display_name: 'Unsaved Trader' });
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).user()?.display_name).toBe('Unsaved Trader');
  });

  it('rejects overlong display names without sending a patch', () => {
    fillName('x'.repeat(81));
    submit();
    fixture.detectChanges();
    http.expectNone('/api/me');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'at most 80',
    );
  });

  it('shows a fresh sign-in instruction for an old session without clearing it', async () => {
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((candidate) => candidate.textContent?.includes('Link Google'))!;
    button.click();
    const request = await vi.waitFor(() => http.expectOne('/api/auth/oauth/google/link/start'));
    request.flush(
      { code: 'UNAUTHORIZED', detail: 'Sign in again.' },
      { status: 401, statusText: 'Unauthorized' },
    );
    await fixture.whenStable();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        'retry within five minutes',
      );
    });
    expect(TestBed.inject(TokenStorageService).get()).toBe('account-token');
    expect(fixture.nativeElement.querySelector('a[href*="reauth=1"]')).toBeTruthy();
  });
});
