import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
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
  ProblemDetails,
  WebAuthnLoginOptionsResponse,
  WebAuthnRegisterOptionsResponse,
} from './auth.models';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly sessionChecked = signal(false);
  private sessionPromise: Promise<boolean> | null = null;

  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokens.hasToken());

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
      this.http.post<WebAuthnRegisterOptionsResponse>(
        '/api/auth/webauthn/register/options',
        { email },
      ),
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
      this.http.post<WebAuthnLoginOptionsResponse>(
        '/api/auth/webauthn/login/options',
        { email },
      ),
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
    if (response.user) {
      this.userSignal.set(response.user);
      this.sessionChecked.set(true);
      return;
    }
    await this.loadMe();
    this.sessionChecked.set(true);
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
  return value?.startsWith('/') && !value.startsWith('//') ? value : fallback;
}
