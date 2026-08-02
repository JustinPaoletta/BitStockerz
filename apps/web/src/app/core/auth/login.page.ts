import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TokenStorageService } from './token-storage.service';

interface AuthResponse {
  access_token: string;
}

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule],
  template: `
    <section class="auth-panel panel">
      <p class="eyebrow">Milestone 3 workspace</p>
      <h1>Strategy research, grounded in the numbers.</h1>
      <p class="lede">Use the development email flow to review and run backtests.</p>
      <form (submit)="submit('login', $event)">
        <label for="email">Email</label>
        <input id="email" type="email" autocomplete="email" [formControl]="email" />
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <div class="actions">
          <button class="button primary" type="submit" [disabled]="busy()">Log in</button>
          <button
            class="button secondary"
            type="button"
            [disabled]="busy()"
            (click)="submit('register')"
          >
            Register
          </button>
        </div>
      </form>
    </section>
  `,
  styles: `
    .auth-panel {
      margin: 6vh auto;
      max-width: 560px;
      padding: clamp(2rem, 6vw, 4rem);
    }
    h1 {
      font-size: clamp(2.2rem, 7vw, 4.8rem);
      line-height: 0.95;
      margin: 0.5rem 0 1.2rem;
    }
    form {
      margin-top: 2rem;
    }
  `,
})
export class LoginPage {
  protected readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStorageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected async submit(action: 'login' | 'register', event?: SubmitEvent): Promise<void> {
    event?.preventDefault();
    this.email.markAsTouched();
    if (this.email.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.http.post<AuthResponse>(`/api/auth/${action}`, {
          email: this.email.value,
        }),
      );
      this.tokens.set(response.access_token);
      await this.router.navigateByUrl(
        safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')),
      );
    } catch {
      this.error.set(
        action === 'login'
          ? 'That email is not registered yet. Use Register once, then log in.'
          : 'Registration failed. The email may already be registered.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

export function safeReturnUrl(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/backtests';
}
