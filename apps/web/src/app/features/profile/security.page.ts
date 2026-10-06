import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';

@Component({
  selector: 'app-security-page',
  imports: [RouterLink, DatePipe],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Account</p>
        <h1>Sign-in security</h1>
        <p>
          Sign in within the last five minutes before adding/removing passkeys or revoking sessions.
        </p>
      </div>
      <a routerLink="/profile">Back to account</a>
    </section>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="panel">
      <h2>Passkeys</h2>
      <p>Enroll another device so you can recover access if your primary device is lost.</p>
      @for (key of passkeys(); track key.id) {
        <p>
          Added {{ key.created_at | date: 'medium' }}
          <button
            type="button"
            class="button ghost"
            [disabled]="busy()"
            (click)="removePasskey(key.id)"
          >
            Remove passkey
          </button>
        </p>
      }
      <button type="button" class="button primary" [disabled]="busy()" (click)="enroll()">
        Add passkey
      </button>
    </section>
    <section class="panel">
      <h2>Active sessions</h2>
      @for (session of sessions(); track session.id) {
        <p>
          {{ session.current ? 'This session' : 'Other session' }} · Expires
          {{ session.expires_at | date: 'medium' }}
          @if (!session.current) {
            <button
              type="button"
              class="button ghost"
              [disabled]="busy()"
              (click)="revoke(session.id)"
            >
              Revoke session
            </button>
          }
        </p>
      }
      <button
        type="button"
        class="button secondary"
        [disabled]="busy() || sessions().length <= 1"
        (click)="revokeOthers()"
      >
        Revoke all other sessions
      </button>
    </section>
  `,
  styles: `
    .panel {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    p {
      overflow-wrap: anywhere;
    }
  `,
})
export class SecurityPage {
  private readonly http = inject(HttpClient);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly sessions = signal<{ id: string; current: boolean; expires_at: string }[]>([]);
  readonly passkeys = signal<{ id: string; created_at: string }[]>([]);
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    try {
      const [sessions, keys] = await Promise.all([
        firstValueFrom(
          this.http.get<{ sessions: { id: string; current: boolean; expires_at: string }[] }>(
            '/api/me/security/sessions',
          ),
        ),
        firstValueFrom(
          this.http.get<{ passkeys: { id: string; created_at: string }[] }>(
            '/api/me/security/passkeys',
          ),
        ),
      ]);
      this.sessions.set(sessions.sessions);
      this.passkeys.set(keys.passkeys);
    } catch {
      this.error.set('Unable to load sign-in methods and sessions.');
    }
  }
  private async act(work: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
      await this.load();
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? (error.error?.detail ?? 'Sign in again, then retry within five minutes.')
          : error instanceof Error
            ? error.message
            : 'This action failed.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  enroll(): Promise<void> {
    return this.act(async () => {
      const result = await firstValueFrom(
        this.http.post<{ challenge_id: string; options: PublicKeyCredentialCreationOptionsJSON }>(
          '/api/me/security/passkeys/options',
          {},
        ),
      );
      const response = await startRegistration({ optionsJSON: result.options });
      return firstValueFrom(
        this.http.post('/api/me/security/passkeys/verify', {
          challenge_id: result.challenge_id,
          response,
        }),
      );
    });
  }
  removePasskey(id: string): Promise<void> {
    if (!confirm('Remove this passkey? You must keep another usable sign-in method.'))
      return Promise.resolve();
    return this.act(() => firstValueFrom(this.http.delete(`/api/me/security/passkeys/${id}`)));
  }
  revoke(id: string): Promise<void> {
    return this.act(() => firstValueFrom(this.http.delete(`/api/me/security/sessions/${id}`)));
  }
  revokeOthers(): Promise<void> {
    return this.act(async () => {
      for (const session of this.sessions().filter((item) => !item.current))
        await firstValueFrom(this.http.delete(`/api/me/security/sessions/${session.id}`));
    });
  }
}
