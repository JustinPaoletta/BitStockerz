import { Component, HostListener, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { PageGuideComponent } from '../../shared/ui/page-guide.component';
import { AuthService, safeReturnUrl } from './auth.service';
import type { AuthProviders, OAuthProvider } from './auth.models';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, PageGuideComponent],
  template: `
    <div class="auth-layout">
      <aside class="brand-story" aria-label="About BitStockerz">
        <div class="story-label"><span class="signal-dot"></span> THE STRATEGY WORKSPACE</div>

        <h2>Find your edge.<br /><em>Then test it.</em></h2>
        <p class="story-copy">
          Turn a market idea into a strategy you can test. Research, backtest, and paper trade in
          one focused workspace.
        </p>
        <div class="research-motif" aria-hidden="true">
          <img src="/brand/mark.svg" alt="" width="240" height="240" />
          <span class="motif-caption">IDEA → EVIDENCE</span>
        </div>
        <div class="story-principles">
          <span>01 / Research</span><span>02 / Test</span><span>03 / Paper trade</span>
        </div>
        <p class="story-footnote">Build your process. Understand your risk.</p>
      </aside>
      <section class="auth-panel panel">
        <p class="eyebrow">YOUR NEXT IDEA STARTS HERE</p>
        <h1>Sign in with a passkey</h1>
        @if (reauthenticating) {
          <p class="hint">
            Verify your account using a sign-in method already attached to it. You will return to
            Account settings to add your recovery method.
          </p>
        }
        <app-page-guide
          description="BitStockerz uses passkeys instead of passwords. Your device handles Face ID, Touch ID, or a security key."
          [steps]="[
            'Enter your email and display name (first time only).',
            'Choose Create with passkey and approve the browser prompt.',
            'Next visits: same email, then Sign in with passkey.',
          ]"
        />

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
              {{
                busy()
                  ? 'Working…'
                  : mode() === 'register'
                    ? 'Create with passkey'
                    : 'Sign in with passkey'
              }}
            </button>
            @if (!reauthenticating) {
              <button
                class="button secondary"
                type="button"
                [disabled]="busy()"
                (click)="toggleMode()"
              >
                {{
                  mode() === 'register' ? 'Have an account? Sign in' : 'Need an account? Register'
                }}
              </button>
            }
          </div>
        </form>

        @if (providers().google || providers().apple) {
          <div class="provider-actions" aria-label="Other sign-in methods">
            <p class="muted">Other sign-in methods</p>
            @if (providers().google) {
              <button
                class="button secondary"
                type="button"
                [disabled]="busy()"
                (click)="onOAuth('google')"
              >
                Continue with Google
              </button>
            }
            @if (providers().apple) {
              <button
                class="button secondary"
                type="button"
                [disabled]="busy()"
                (click)="onOAuth('apple')"
              >
                Continue with Apple
              </button>
            }
          </div>
        }
        @if (providersError()) {
          <p class="muted" role="status">
            Other sign-in methods could not be loaded.
            <button
              class="button ghost small"
              type="button"
              [disabled]="busy()"
              (click)="loadProviders()"
            >
              Retry
            </button>
          </p>
        }

        <details class="recovery-help">
          <summary>Lost access to your passkey?</summary>
          <p>
            Sign in with the Google or Apple account you previously linked to BitStockerz to restore
            access to your existing account.
          </p>
          <p>
            If you have no linked provider and no working passkey, automatic recovery is
            unavailable. An email address alone cannot prove account ownership.
          </p>
          <p>When you can sign in, add a recovery method in Account settings.</p>
        </details>

        @if (!environment.production) {
          <details class="fallback">
            <summary>Email fallback</summary>
            <div class="actions">
              <button
                class="button ghost"
                type="button"
                [disabled]="busy()"
                (click)="onEmail('login')"
              >
                Email log in
              </button>
              @if (!reauthenticating) {
                <button
                  class="button ghost"
                  type="button"
                  [disabled]="busy()"
                  (click)="onEmail('register')"
                >
                  Email register
                </button>
              }
            </div>
          </details>
        }
      </section>
    </div>
  `,
  styles: `
    .auth-layout {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: clamp(2rem, 5vw, 5rem);
      align-items: center;
      margin: 4vh auto;
    }
    .brand-story {
      padding: 1rem 0;
    }
    .story-label {
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 0.6rem;
    }
    .signal-dot {
      width: 6px;
      height: 6px;
      background: var(--accent);
      border-radius: 50%;
    }
    .brand-story h2 {
      font-size: clamp(2.8rem, 4.7vw, 4.4rem);
      line-height: 1.02;
      letter-spacing: -0.065em;
      margin: 2rem 0 1.5rem;
      font-weight: 500;
    }
    .brand-story em {
      font-style: normal;
      color: var(--accent);
    }
    .story-copy {
      color: var(--muted);
      max-width: 38ch;
      line-height: 1.7;
      font-size: 0.95rem;
    }
    .research-motif {
      position: relative;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2rem;
      overflow: hidden;
      border: 1px solid var(--border);
      background:
        repeating-linear-gradient(0deg, transparent 0 39px, var(--motif-grid) 39px 40px),
        repeating-linear-gradient(90deg, transparent 0 39px, var(--motif-grid) 39px 40px);
    }
    .research-motif img {
      width: 170px;
      height: 170px;
    }
    .motif-caption {
      position: absolute;
      left: 14px;
      bottom: 12px;
      font: 9px monospace;
      letter-spacing: 0.15em;
      color: var(--muted);
    }
    .story-principles {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 1rem;
      font-size: 0.65rem;
      color: var(--text);
    }
    .story-footnote {
      margin-top: 2rem;
      color: var(--muted);
      font-size: 0.72rem;
    }
    @media (max-width: 820px) {
      .auth-layout {
        grid-template-columns: 1fr;
        max-width: 560px;
        margin-top: 1rem;
      }
      .research-motif,
      .story-principles,
      .story-footnote {
        display: none;
      }
      .brand-story h2 {
        font-size: 2.6rem;
        margin: 1.25rem 0;
      }
      .story-copy {
        margin-bottom: 0;
      }
    }
    .auth-panel {
      margin: 0;
      width: 100%;
      max-width: 560px;
      padding: clamp(1.5rem, 3vw, 2.5rem);
    }
    h1 {
      font-size: clamp(2rem, 3vw, 2.8rem);
      font-weight: 500;
      line-height: 1.08;
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
    .provider-actions {
      display: grid;
      gap: 0.75rem;
      margin-top: 1.5rem;
    }
    .provider-actions p {
      margin: 0;
    }
    .recovery-help {
      margin-top: 1.5rem;
    }
    .recovery-help p {
      color: var(--muted);
      font-size: 0.875rem;
      line-height: 1.6;
    }
    summary {
      color: var(--muted);
      cursor: pointer;
      font-weight: 600;
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
  protected readonly providers = signal<AuthProviders>({ google: false, apple: false });
  protected readonly providersError = signal(false);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly reauthenticating = this.route.snapshot.queryParamMap.get('reauth') === '1';

  constructor() {
    void this.redirectIfAuthenticated();
    void this.loadProviders();
  }

  @HostListener('window:pageshow')
  protected onPageShow(): void {
    // A provider's Back action may restore this page from the browser cache.
    this.busy.set(false);
  }

  protected async loadProviders(): Promise<void> {
    this.providersError.set(false);
    try {
      this.providers.set(await this.auth.getProviders());
    } catch {
      this.providersError.set(true);
    }
  }

  protected async onOAuth(provider: OAuthProvider): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.startOAuth(
        provider,
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch (error) {
      this.error.set(
        this.auth.problemMessage(error, 'Sign-in could not be started. Please try again.'),
      );
      this.busy.set(false);
    }
  }

  protected toggleMode(): void {
    this.mode.update((value) => (value === 'login' ? 'register' : 'login'));
    this.error.set('');
  }

  private async redirectIfAuthenticated(): Promise<void> {
    if (this.reauthenticating) return;
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
            ? 'Passkey registration failed. Please try again.'
            : 'Passkey sign-in failed. Try again or use a previously linked sign-in method.',
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
