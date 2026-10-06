import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { downloadText } from '../../shared/format/download';

@Component({
  selector: 'app-account-data-page',
  imports: [RouterLink, FormsModule, DatePipe],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Account</p>
        <h1>Your data and experiments</h1>
      </div>
      <a routerLink="/profile">Back to account</a>
    </section>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
    <section class="panel">
      <h2>Export your data</h2>
      <p>
        Download your profile, strategies and versions, backtests, paper ledger, archives,
        watchlist, and available activity records. Sign-in secrets and passkey public keys are
        excluded.
      </p>
      <button class="button primary" type="button" [disabled]="busy()" (click)="exportData()">
        Download account JSON
      </button>
    </section>
    <section class="panel">
      <h2>Start a new paper experiment</h2>
      <p>
        Reset cash to your account's starting balance and clear current positions. Previous orders,
        executions, and positions are archived for download. Automated strategies are stopped.
      </p>
      <p>Sign in within the last five minutes before resetting.</p>
      <button class="button secondary" type="button" [disabled]="busy()" (click)="reset()">
        Archive and reset paper account
      </button>
      <h3>Previous experiments</h3>
      @for (archive of archives(); track archive.id) {
        <p>
          {{ archive.created_at | date: 'medium' }}
          <button class="button ghost" type="button" (click)="downloadArchive(archive)">
            Download archive
          </button>
        </p>
      } @empty {
        <p>No archived experiments.</p>
      }
    </section>
    <section class="panel">
      <h2>Delete your account</h2>
      <p>
        This permanently removes your active account, sign-in methods, strategies, backtests, paper
        ledger, watchlist, and archives. Operational logs and existing backups follow the published
        retention policy.
      </p>
      <a routerLink="/data-policy">Read the data policy</a>
      <p>
        Export anything you want to keep first. Sign in within the last five minutes, then type your
        account email.
      </p>
      <label>Account email <input [(ngModel)]="confirmation" autocomplete="off" /></label
      ><button
        class="button secondary"
        type="button"
        [disabled]="busy() || !confirmation"
        (click)="deleteAccount()"
      >
        Delete account permanently
      </button>
    </section>
  `,
  styles: `
    .panel {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    label {
      display: grid;
      gap: 0.5rem;
      margin-block: 1rem;
      max-width: 400px;
    }
  `,
})
export class AccountDataPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly error = signal('');
  readonly message = signal('');
  readonly busy = signal(false);
  readonly archives = signal<{ id: string; created_at: string; snapshot: unknown }[]>([]);
  confirmation = '';
  constructor() {
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      this.archives.set(
        (
          await firstValueFrom(
            this.http.get<{ archives: { id: string; created_at: string; snapshot: unknown }[] }>(
              '/api/workspace/paper/archives',
            ),
          )
        ).archives,
      );
    } catch {
      this.error.set('Unable to load experiment archives.');
    }
  }
  private async act(work: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await work();
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? (error.error?.detail ?? 'Sign in again, then retry.')
          : 'This action failed.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  exportData(): Promise<void> {
    return this.act(async () => {
      const data = await firstValueFrom(this.http.get('/api/workspace/account-export'));
      downloadText('bitstockerz-account.json', JSON.stringify(data, null, 2), 'application/json');
    });
  }
  downloadArchive(archive: { id: string; snapshot: unknown }): void {
    downloadText(
      `paper-experiment-${archive.id}.json`,
      JSON.stringify(archive.snapshot, null, 2),
      'application/json',
    );
  }
  reset(): Promise<void> {
    if (!confirm('Archive the current paper experiment and reset cash and positions?'))
      return Promise.resolve();
    return this.act(async () => {
      await firstValueFrom(this.http.post('/api/workspace/paper/reset', { confirmation: 'RESET' }));
      await this.load();
      this.message.set('Your previous experiment is archived. Cash and positions have been reset.');
    });
  }
  deleteAccount(): Promise<void> {
    if (!confirm('Permanently delete your account and all product data? This cannot be undone.'))
      return Promise.resolve();
    return this.act(async () => {
      await firstValueFrom(
        this.http.delete('/api/workspace/account', { body: { confirmation: this.confirmation } }),
      );
      await this.auth.logout();
      await this.router.navigate(['/login']);
    });
  }
}
