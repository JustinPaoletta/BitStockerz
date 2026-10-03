import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Router } from '@angular/router';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import { firstValueFrom } from 'rxjs';
import type {
  AuthResponse,
  AuthUser,
  AuthProviders,
  OAuthProvider,
  OAuthStartResponse,
  OAuthSessionResponse,
  ProblemDetails,
  WebAuthnLoginOptionsResponse,
  WebAuthnRegisterOptionsResponse,
} from './auth.models';
import { TokenStorageService } from './token-storage.service';

export const OAUTH_NAVIGATE = new InjectionToken<(url: string) => void>('OAuth navigation', {
  providedIn: 'root',
  factory: () => (url: string) => window.location.assign(url),
});

const OAUTH_FLOW_KEY = 'bs.oauth_flow';
interface OAuthFlow {
  provider: OAuthProvider;
  state: string;
  verifier: string;
  expiresAt: number;
  returnPath: string;
  intent: 'login' | 'link';
  linkTokenHash?: string;
  linkUserId?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly navigateToProvider = inject(OAUTH_NAVIGATE);
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly sessionChecked = signal(false);
  private sessionPromise: Promise<boolean> | null = null;

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokens.hasToken());

  getProviders(): Promise<AuthProviders> {
    return firstValueFrom(this.http.get<AuthProviders>('/api/auth/providers'));
  }

  async getProfile(): Promise<AuthUser> {
    const user = await firstValueFrom(this.http.get<AuthUser>('/api/me'));
    this.userSignal.set(user);
    this.sessionChecked.set(true);
    return user;
  }

  async updateProfile(displayName: string): Promise<AuthUser> {
    const user = await firstValueFrom(
      this.http.patch<AuthUser>('/api/me', { display_name: displayName.trim() }),
    );
    this.userSignal.set(user);
    return user;
  }

  async startOAuth(
    provider: OAuthProvider,
    returnPath: string,
    intent: 'login' | 'link' = 'login',
  ): Promise<void> {
    sessionStorage.removeItem(OAUTH_FLOW_KEY);
    if (!globalThis.crypto?.subtle) {
      throw new Error(
        'Use a supported browser with a secure connection to sign in with Google or Apple.',
      );
    }
    const linkToken = intent === 'link' ? this.tokens.get() : null;
    const linkUserId = intent === 'link' ? this.userSignal()?.id : undefined;
    if (intent === 'link' && (!linkToken || !linkUserId)) {
      throw new Error('Sign in again before adding a recovery method.');
    }
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
    const codeChallenge = await sha256(verifier);
    const path = safeReturnUrl(returnPath);
    const response = await firstValueFrom(
      this.http.post<OAuthStartResponse>(
        `/api/auth/oauth/${provider}/${intent === 'link' ? 'link' : 'browser'}/start`,
        { code_challenge: codeChallenge, return_path: path },
      ),
    );
    const authorizationUrl = new URL(response.authorization_url);
    const expectedOrigin =
      provider === 'google' ? 'https://accounts.google.com' : 'https://appleid.apple.com';
    if (
      response.provider !== provider ||
      !response.state ||
      !Number.isFinite(response.expires_in_seconds) ||
      response.expires_in_seconds <= 0 ||
      authorizationUrl.origin !== expectedOrigin
    ) {
      throw new Error('Unable to start sign-in. Please try again.');
    }
    const flow: OAuthFlow = {
      provider,
      state: response.state,
      verifier,
      expiresAt: Date.now() + response.expires_in_seconds * 1000,
      returnPath: path,
      intent,
      ...(linkToken ? { linkTokenHash: await sha256(linkToken), linkUserId } : {}),
    };
    sessionStorage.setItem(OAUTH_FLOW_KEY, JSON.stringify(flow));
    try {
      this.navigateToProvider(authorizationUrl.href);
    } catch (error) {
      sessionStorage.removeItem(OAUTH_FLOW_KEY);
      throw error;
    }
  }

  async completeOAuthCallback(): Promise<{ returnPath: string; intent: 'login' | 'link' }> {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    // Remove the one-use code before loading a profile or making any HTTP request.
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
    const storedFlow = sessionStorage.getItem(OAUTH_FLOW_KEY);
    sessionStorage.removeItem(OAUTH_FLOW_KEY);
    const flow = readOAuthFlow(storedFlow);
    if (
      !flow ||
      flow.expiresAt <= Date.now() ||
      fragment.getAll('state').length !== 1 ||
      fragment.get('state') !== flow.state
    ) {
      throw new Error('This sign-in attempt has expired or was already used. Start again.');
    }
    if (fragment.has('error')) {
      const error = fragment.get('error');
      if (error === 'cancelled')
        throw new Error('Sign-in was cancelled. Your account has not changed.');
      if (error === 'account_conflict')
        throw new Error(
          'Sign in to your existing BitStockerz account, then link this provider in Account settings.',
        );
      throw new Error('Sign-in could not be completed. Start again.');
    }
    if (fragment.getAll('code').length !== 1 || !fragment.get('code')) {
      throw new Error('This sign-in response is incomplete. Start again.');
    }
    const currentToken = this.tokens.get();
    if (
      flow.intent === 'link' &&
      (!currentToken || (await sha256(currentToken)) !== flow.linkTokenHash)
    ) {
      throw new Error('Sign in again before adding a recovery method.');
    }
    const response = await firstValueFrom(
      this.http.post<OAuthSessionResponse>('/api/auth/oauth/session/exchange', {
        code: fragment.get('code'),
        verifier: flow.verifier,
      }),
    );
    if (
      response.intent !== flow.intent ||
      (flow.intent === 'link' &&
        (response.access_token !== currentToken || response.user?.id !== flow.linkUserId))
    ) {
      throw new Error('This sign-in response does not match your account. Start again.');
    }
    if (flow.intent === 'link') {
      // The initiating bearer remains unchanged throughout a linking attempt.
      if (response.user) this.userSignal.set(response.user);
      await this.getProfile();
    } else {
      await this.applySession(response);
    }
    return {
      returnPath: safeReturnUrl(response.return_path, flow.returnPath),
      intent: flow.intent,
    };
  }

  async ensureSession(): Promise<boolean> {
    if (!this.tokens.hasToken()) {
      this.userSignal.set(null);
      this.sessionChecked.set(true);
      return false;
    }
    if (this.sessionChecked() && this.userSignal()) {
      return true;
    }
    if (this.sessionPromise) {
      return this.sessionPromise;
    }
    this.sessionPromise = this.loadMe()
      .then((ok) => {
        this.sessionChecked.set(true);
        return ok;
      })
      .finally(() => {
        this.sessionPromise = null;
      });
    return this.sessionPromise;
  }

  async loginWithEmail(email: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/login', { email }),
    );
    await this.applySession(response);
  }

  async registerWithEmail(email: string, displayName?: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/register', {
        email,
        ...(displayName ? { display_name: displayName } : {}),
      }),
    );
    await this.applySession(response);
  }

  async registerWithPasskey(email: string, displayName?: string): Promise<void> {
    const options = await firstValueFrom(
      this.http.post<WebAuthnRegisterOptionsResponse>('/api/auth/webauthn/register/options', {
        email,
      }),
    );
    const attestation = await startRegistration({
      optionsJSON: options.options as unknown as PublicKeyCredentialCreationOptionsJSON,
    });
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/webauthn/register/verify', {
        email,
        challenge_id: options.challenge_id,
        ...(displayName ? { display_name: displayName } : {}),
        response: attestation as RegistrationResponseJSON,
      }),
    );
    await this.applySession(response);
  }

  async loginWithPasskey(email: string): Promise<void> {
    const options = await firstValueFrom(
      this.http.post<WebAuthnLoginOptionsResponse>('/api/auth/webauthn/login/options', { email }),
    );
    const assertion = await startAuthentication({
      optionsJSON: options.options as unknown as PublicKeyCredentialRequestOptionsJSON,
    });
    const response = await firstValueFrom(
      this.http.post<AuthResponse>('/api/auth/webauthn/login/verify', {
        email,
        challenge_id: options.challenge_id,
        response: assertion as AuthenticationResponseJSON,
      }),
    );
    await this.applySession(response);
  }

  async logout(): Promise<void> {
    try {
      if (this.tokens.hasToken()) {
        await firstValueFrom(this.http.post('/api/auth/logout', {}));
      }
    } catch {
      // Always clear local session.
    } finally {
      this.clearSession();
      await this.router.navigate(['/login']);
    }
  }

  clearSession(): void {
    this.tokens.clear();
    sessionStorage.removeItem(OAUTH_FLOW_KEY);
    this.userSignal.set(null);
    this.sessionChecked.set(false);
  }

  problemMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const problem = error.error as ProblemDetails | undefined;
      return problem?.detail ?? problem?.title ?? fallback;
    }
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private async applySession(response: AuthResponse): Promise<void> {
    this.tokens.set(response.access_token);
    // Always hydrate all profile fields, including recovery methods, after sign-in.
    if (response.user) this.userSignal.set(response.user);
    const ok = await this.loadMe();
    // loadMe clears the session on failure; only mark checked when the user loaded.
    if (ok) {
      this.sessionChecked.set(true);
    } else {
      throw new Error('Your session could not be loaded. Please sign in again.');
    }
  }

  private async loadMe(): Promise<boolean> {
    try {
      const user = await firstValueFrom(this.http.get<AuthUser>('/api/auth/me'));
      this.userSignal.set(user);
      return true;
    } catch {
      this.clearSession();
      return false;
    }
  }
}

export function safeReturnUrl(value: string | null, fallback = '/dashboard'): string {
  if (!value?.startsWith('/')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith('//') ||
      decoded.includes('\\') ||
      Array.from(decoded).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return fallback;
    return value;
  } catch {
    return fallback;
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  return base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
  );
}

function readOAuthFlow(value: string | null): OAuthFlow | null {
  if (!value) return null;
  try {
    const flow = JSON.parse(value) as Partial<OAuthFlow>;
    if (
      (flow.provider !== 'google' && flow.provider !== 'apple') ||
      (flow.intent !== 'login' && flow.intent !== 'link') ||
      typeof flow.state !== 'string' ||
      !flow.state ||
      typeof flow.verifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(flow.verifier) ||
      typeof flow.returnPath !== 'string' ||
      safeReturnUrl(flow.returnPath, '') !== flow.returnPath ||
      typeof flow.expiresAt !== 'number' ||
      !Number.isFinite(flow.expiresAt) ||
      (flow.intent === 'link' &&
        (typeof flow.linkTokenHash !== 'string' || typeof flow.linkUserId !== 'string'))
    )
      return null;
    return flow as OAuthFlow;
  } catch {
    return null;
  }
}
