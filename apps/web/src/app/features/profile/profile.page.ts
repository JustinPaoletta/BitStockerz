import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AuthProviders, AuthUser, OAuthProvider } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { BsCardComponent } from '../../shared/ui/bs-card.component';
import { InlineErrorComponent } from '../../shared/ui/inline-error.component';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, RouterLink, BsCardComponent, InlineErrorComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">YOUR ACCOUNT</p>
        <h1>Account settings</h1>
        <p class="lede">Manage your profile and the ways you can sign in.</p>
      </div>
    </section>
    @if (loading()) {
      <p role="status">Loading your account…</p>
    } @else if (loadError()) {
      <app-inline-error [message]="loadError()" (retry)="loadProfile()" />
    } @else if (profile(); as user) {
      <div class="profile-grid">
        <app-bs-card title="Profile" eyebrow="DISPLAY SETTINGS">
          <form (submit)="save($event)">
            <label for="profile-email">Email</label>
            <input
              id="profile-email"
              type="email"
              [value]="user.email"
              readonly
              aria-describedby="email-help"
            />
            <p id="email-help" class="hint">Your account email is read-only.</p>
            <label for="profile-name">Display name</label>
            <input
              id="profile-name"
              type="text"
              autocomplete="nickname"
              maxlength="80"
              [formControl]="displayName"
              aria-describedby="name-help"
            />
            <p id="name-help" class="hint">Up to 80 characters. You can leave this blank.</p>
            @if (displayName.invalid && displayName.touched) {
              <p class="error" role="alert">Use a display name with at most 80 characters.</p>
            }
            <label for="profile-currency">Base currency</label>
            <input id="profile-currency" value="USD" readonly aria-describedby="currency-help" />
            <p id="currency-help" class="hint">
              The paper ledger uses USD. Display settings do not convert balances.
            </p>
            @if (saveError()) {
              <p class="error" role="alert">{{ saveError() }}</p>
            }
            @if (saved()) {
              <p class="success" role="status">Profile saved.</p>
            }
            <div class="actions">
              <button
                class="button primary"
                type="submit"
                [disabled]="saving() || linking() || displayName.invalid || !hasChanges()"
              >
                {{ saving() ? 'Saving…' : 'Save profile' }}
              </button>
            </div>
          </form>
        </app-bs-card>
        <app-bs-card title="Sign-in and recovery" eyebrow="ACCOUNT ACCESS">
          <p class="hint">
            A linked Google or Apple account can restore access to this same account if you lose
            your passkey device.
          </p>
          <ul class="methods" aria-label="Your sign-in methods">
            <li>
              <div>
                <strong>Passkeys</strong>
                <p class="hint">{{ user.passkey_count ?? 0 }} registered</p>
              </div>
            </li>
            <li>
              <div>
                <strong>Google</strong>
                <p class="hint">
                  {{
                    user.linked_auth_methods?.google
                      ? providers().google
                        ? 'Linked'
                        : 'Linked · sign-in currently unavailable'
                      : 'Not linked'
                  }}
                </p>
              </div>
              @if (providers().google && !user.linked_auth_methods?.google) {
                <button
                  class="button secondary small"
                  type="button"
                  [disabled]="linking() || saving() || hasChanges()"
                  (click)="link('google')"
                >
                  Link Google
                </button>
              }
            </li>
            <li>
              <div>
                <strong>Apple</strong>
                <p class="hint">
                  {{
                    user.linked_auth_methods?.apple
                      ? providers().apple
                        ? 'Linked'
                        : 'Linked · sign-in currently unavailable'
                      : 'Not linked'
                  }}
                </p>
              </div>
              @if (providers().apple && !user.linked_auth_methods?.apple) {
                <button
                  class="button secondary small"
                  type="button"
                  [disabled]="linking() || saving() || hasChanges()"
                  (click)="link('apple')"
                >
                  Link Apple
                </button>
              }
            </li>
          </ul>
          @if (
            (user.passkey_count ?? 0) > 0 &&
            !user.linked_auth_methods?.google &&
            !user.linked_auth_methods?.apple
          ) {
            <p class="recovery-reminder">
              You have no linked recovery provider. Keep access to your passkey and add a recovery
              method when available.
            </p>
          }
          @if (providersError()) {
            <p class="hint" role="status">Provider availability could not be loaded.</p>
            <button class="button ghost small" type="button" (click)="loadProviders()">
              Retry providers
            </button>
          } @else if (!providers().google && !providers().apple) {
            <p class="hint">Google and Apple sign-in are currently unavailable.</p>
          }
          @if (hasChanges()) {
            <p class="hint">Save your display name edits before adding a recovery method.</p>
          }
          @if (linking()) {
            <p role="status">Opening secure provider sign-in…</p>
          }
          @if (linkError()) {
            <p class="error" role="alert">{{ linkError() }}</p>
          }
          <p class="hint">
            Adding a recovery method requires signing in within the last five minutes.
          </p>
          <a
            class="button ghost small"
            routerLink="/login"
            [queryParams]="{ reauth: '1', returnUrl: '/profile' }"
            >Sign in again to verify your account</a
          >
          <p class="hint">
            Use a sign-in method already attached to this account. An email address alone does not
            prove ownership.
          </p>
        </app-bs-card>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .profile-grid {
      display: grid;
      gap: 1.25rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    form {
      display: grid;
      gap: 0.75rem;
    }
    .hint {
      font-size: 0.875rem;
      line-height: 1.6;
      margin: 0.25rem 0 1rem;
    }
    input[readonly] {
      color: var(--muted);
    }
    .methods {
      list-style: none;
      padding: 0;
      margin: 1.5rem 0;
    }
    .methods li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      border-top: 1px solid var(--border);
      padding: 1rem 0;
    }
    .methods p {
      margin: 0.25rem 0 0;
    }
    .methods strong {
      font-weight: 500;
    }
    .recovery-reminder {
      background: var(--surface-2);
      border-left: 3px solid var(--accent);
      padding: 1rem;
      line-height: 1.6;
    }
    .success {
      color: var(--positive);
    }
    @media (max-width: 820px) {
      .profile-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class ProfilePage {
  protected readonly displayName = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(80)],
  });
  protected readonly profile = signal<AuthUser | null>(null);
  protected readonly providers = signal<AuthProviders>({ google: false, apple: false });
  protected readonly providersError = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal('');
  protected readonly linking = signal(false);
  protected readonly linkError = signal('');
  private readonly auth = inject(AuthService);

  constructor() {
    void this.loadProfile();
    void this.loadProviders();
    this.displayName.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.saved.set(false));
  }

  @HostListener('window:pageshow')
  protected onPageShow(): void {
    this.linking.set(false);
  }

  protected hasChanges(): boolean {
    return this.displayName.value.trim() !== (this.profile()?.display_name ?? '');
  }

  protected async loadProfile(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    try {
      const user = await this.auth.getProfile();
      this.profile.set(user);
      this.displayName.setValue(user.display_name ?? '');
      this.displayName.markAsPristine();
    } catch (error) {
      this.loadError.set(
        this.auth.problemMessage(error, 'Your profile could not be loaded. Please try again.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadProviders(): Promise<void> {
    this.providersError.set(false);
    try {
      this.providers.set(await this.auth.getProviders());
    } catch {
      this.providersError.set(true);
    }
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    this.displayName.markAsTouched();
    if (this.displayName.invalid || this.saving() || this.linking() || !this.hasChanges()) return;
    this.saving.set(true);
    this.saveError.set('');
    this.saved.set(false);
    try {
      const user = await this.auth.updateProfile(this.displayName.value);
      this.profile.set(user);
      this.displayName.setValue(user.display_name ?? '');
      this.displayName.markAsPristine();
      this.saved.set(true);
    } catch (error) {
      this.saveError.set(
        this.auth.problemMessage(
          error,
          'Your profile could not be saved. Your edits are still here; please try again.',
        ),
      );
    } finally {
      this.saving.set(false);
    }
  }

  protected async link(provider: OAuthProvider): Promise<void> {
    if (this.linking() || this.saving() || this.hasChanges()) return;
    this.linking.set(true);
    this.linkError.set('');
    try {
      await this.auth.startOAuth(provider, '/profile', 'link');
    } catch (error) {
      this.linkError.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Sign in again using a method already linked to this account, then retry within five minutes.'
          : this.auth.problemMessage(
              error,
              'This provider could not be linked. Your existing sign-in methods are unchanged.',
            ),
      );
      this.linking.set(false);
    }
  }
}
