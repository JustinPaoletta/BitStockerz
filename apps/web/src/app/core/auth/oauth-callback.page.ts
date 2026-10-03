import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-oauth-callback-page',
  imports: [RouterLink],
  template: `
    <section class="panel callback-panel">
      <h1>{{ error() ? 'Sign-in needs another try' : 'Completing sign-in' }}</h1>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
        <div class="actions">
          @if (auth.isAuthenticated()) {
            <a class="button primary" routerLink="/profile">Return to Account settings</a>
          }
          <a
            class="button secondary"
            routerLink="/login"
            [queryParams]="auth.isAuthenticated() ? { reauth: '1', returnUrl: '/profile' } : {}"
            >Try sign-in again</a
          >
        </div>
      } @else {
        <p role="status">Finishing your secure sign-in…</p>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .callback-panel {
      max-width: 38rem;
      margin: 2rem auto;
      padding: 2rem;
    }
    h1 {
      margin-top: 0;
    }
  `,
})
export class OAuthCallbackPage {
  protected readonly auth = inject(AuthService);
  protected readonly error = signal('');
  private readonly router = inject(Router);

  constructor() {
    void this.complete();
  }

  private async complete(): Promise<void> {
    try {
      const result = await this.auth.completeOAuthCallback();
      await this.router.navigateByUrl(result.returnPath);
    } catch (error) {
      this.error.set(
        this.auth.problemMessage(error, 'Sign-in could not be completed. Please try again.'),
      );
    }
  }
}
