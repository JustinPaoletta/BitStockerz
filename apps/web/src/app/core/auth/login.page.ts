import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService, safeReturnUrl } from './auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="auth-panel panel">
      <p class="eyebrow">BitStockerz</p>
      <h1>Sign in securely with a passkey.</h1>
      <p class="lede">
        Create an account or sign in with Face ID, Touch ID, or a security key. Email login remains
        available as a fallback for unsupported browsers and local automation.
      </p>

      <form [formGroup]="form" (submit)="onPasskey($event)">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="username webauthn" formControlName="email" />

        <label for="display">Display name (register only)</label>
        <input id="display" type="text" autocomplete="nickname" formControlName="display_name" />

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <div class="actions">
          <button class="button primary" type="submit" [disabled]="busy()">
            {{ busy() ? 'Working…' : mode() === 'register' ? 'Create with passkey' : 'Sign in with passkey' }}
          </button>
          <button class="button secondary" type="button" [disabled]="busy()" (click)="toggleMode()">
            {{ mode() === 'register' ? 'Have an account? Sign in' : 'Need an account? Register' }}
          </button>
        </div>
      </form>

      @if (!environment.production) {
        <details class="fallback">
          <summary>Email fallback</summary>
          <p class="hint">
            Use this only when passkeys are unavailable. It is the development shortcut, not the
            primary production path.
          </p>
          <div class="actions">
            <button class="button ghost" type="button" [disabled]="busy()" (click)="onEmail('login')">
              Email log in
            </button>
            <button
              class="button ghost"
              type="button"
              [disabled]="busy()"
              (click)="onEmail('register')"
            >
              Email register
            </button>
          </div>
        </details>
      }
    </section>
  `,
  styles: `
    .auth-panel {
      margin: 6vh auto;
      max-width: 560px;
      padding: clamp(2rem, 6vw, 4rem);
    }
    h1 {
      font-size: clamp(2.2rem, 7vw, 4.2rem);
      line-height: 0.95;
      margin: 0.5rem 0 1.2rem;
    }
    form {
      display: grid;
      gap: 0.85rem;
      margin-top: 2rem;
    }
    .fallback {
      margin-top: 2rem;
    }
    summary {
      color: var(--muted);
      cursor: pointer;
      font-weight: 700;
    }
  `,
})
export class LoginPage {
  protected readonly environment = environment;
  protected readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    display_name: new FormControl('', { nonNullable: true }),
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly mode = signal<'login' | 'register'>('login');
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    void this.redirectIfAuthenticated();
  }

  protected toggleMode(): void {
    this.mode.update((value) => (value === 'login' ? 'register' : 'login'));
    this.error.set('');
  }

  private async redirectIfAuthenticated(): Promise<void> {
    if (!this.auth.isAuthenticated()) return;
    const ok = await this.auth.ensureSession();
    if (!ok) return;
    await this.router.navigateByUrl(
      safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
    );
  }

  protected async onPasskey(event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    this.form.controls.email.markAsTouched();
    if (this.form.controls.email.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const email = this.form.controls.email.value.trim();
      const displayName = this.form.controls.display_name.value.trim() || undefined;
      if (this.mode() === 'register') {
        await this.auth.registerWithPasskey(email, displayName);
      } else {
        await this.auth.loginWithPasskey(email);
      }
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.error.set(
        this.auth.problemMessage(
          error,
          this.mode() === 'register'
            ? 'Passkey registration failed. Try again or use the email fallback.'
            : 'Passkey sign-in failed. Try again or use the email fallback.',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async onEmail(action: 'login' | 'register'): Promise<void> {
    this.form.controls.email.markAsTouched();
    if (this.form.controls.email.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const email = this.form.controls.email.value.trim();
      const displayName = this.form.controls.display_name.value.trim() || undefined;
      if (action === 'register') {
        await this.auth.registerWithEmail(email, displayName);
      } else {
        await this.auth.loginWithEmail(email);
      }
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.error.set(
        this.auth.problemMessage(
          error,
          action === 'login'
            ? 'That email is not registered yet. Use Email register once, then log in.'
            : 'Registration failed. The email may already be registered.',
        ),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
