import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BacktestsApiService } from '../backtests-api.service';

@Component({
  selector: 'app-backtest-new-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">New research run</p>
        <h1>Run a backtest</h1>
      </div>
      <a class="text-link" routerLink="/backtests">Back to history</a>
    </section>
    <form class="panel form-panel" [formGroup]="form" (ngSubmit)="submit()">
      <div class="field full">
        <label for="strategy">Strategy ID</label>
        <input
          id="strategy"
          formControlName="strategy_id"
          placeholder="UUID from the Strategies API"
        />
        <p class="hint">Use the ID returned by POST /api/strategies.</p>
      </div>
      <div class="field">
        <label for="symbol">Symbol</label><input id="symbol" formControlName="symbol" />
      </div>
      <div class="field">
        <label for="timeframe">Timeframe</label>
        <select id="timeframe" formControlName="timeframe">
          <option value="1d">1 day</option>
          <option value="1h">1 hour</option>
        </select>
      </div>
      <div class="field">
        <label for="start">Start date</label
        ><input id="start" type="date" formControlName="start_date" />
      </div>
      <div class="field">
        <label for="end">End date</label><input id="end" type="date" formControlName="end_date" />
      </div>
      <div class="field full">
        <label for="equity">Initial equity</label
        ><input id="equity" type="number" min="0.01" step="0.01" formControlName="initial_equity" />
      </div>
      @if (error()) {
        <p class="error full" role="alert">{{ error() }}</p>
      }
      <div class="actions full">
        <button class="button primary" type="submit" [disabled]="form.invalid || busy()">
          {{ busy() ? 'Running…' : 'Run backtest' }}
        </button>
        <a class="button ghost" routerLink="/backtests">Cancel</a>
      </div>
    </form>
  `,
  styles: `
    .form-panel {
      display: grid;
      gap: 1.2rem;
      grid-template-columns: repeat(2, 1fr);
      padding: clamp(1.25rem, 4vw, 2.5rem);
    }
    .field {
      min-width: 0;
    }
    .full {
      grid-column: 1 / -1;
    }
    @media (max-width: 650px) {
      .form-panel {
        grid-template-columns: 1fr;
      }
      .full {
        grid-column: auto;
      }
    }
  `,
})
export class BacktestNewPage {
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly form = new FormGroup({
    strategy_id: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    symbol: new FormControl('AAPL', { nonNullable: true, validators: [Validators.required] }),
    timeframe: new FormControl<'1d' | '1h'>('1d', { nonNullable: true }),
    start_date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    end_date: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    initial_equity: new FormControl(10000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
  });
  private readonly api = inject(BacktestsApiService);
  private readonly router = inject(Router);

  constructor() {
    const strategyId = inject(ActivatedRoute).snapshot.queryParamMap.get('strategy_id');
    if (strategyId) this.form.controls.strategy_id.setValue(strategyId);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(this.api.create(this.form.getRawValue()));
      await this.router.navigate(['/backtests', response.run.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The backtest could not be run.');
    } finally {
      this.busy.set(false);
    }
  }
}
