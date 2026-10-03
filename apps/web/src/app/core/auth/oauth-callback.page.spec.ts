import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OAuthCallbackPage } from './oauth-callback.page';

describe('OAuthCallbackPage', () => {
  beforeEach(async () => {
    sessionStorage.clear();
    window.history.replaceState(null, '', '/auth/oauth/callback');
    await TestBed.configureTestingModule({
      imports: [OAuthCallbackPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('handles a refreshed/direct callback with no saved flow and scrubs the fragment', async () => {
    window.history.replaceState(null, '', '/auth/oauth/callback#code=already-used&state=old');
    const fixture = TestBed.createComponent(OAuthCallbackPage);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(window.location.hash).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'expired or was already used',
    );
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeTruthy();
    TestBed.inject(HttpTestingController).expectNone('/api/auth/oauth/session/exchange');
  });
});
