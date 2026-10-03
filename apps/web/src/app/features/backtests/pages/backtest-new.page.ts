import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, distinctUntilChanged, firstValueFrom, map, of, switchMap, timer } from 'rxjs';
import { PageGuideComponent } from '../../../shared/ui/page-guide.component';
import { SymbolSearchComponent } from '../../../shared/symbols/symbol-search.component';
import { StrategiesApiService } from '../../strategies/data/strategies-api.service';
import { BacktestsApiService } from '../backtests-api.service';

@Component({
  selector: 'app-backtest-new-page',
  imports: [ReactiveFormsModule, RouterLink, SymbolSearchComponent, PageGuideComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">New research run</p>
        <h1>Run a backtest</h1>
        @if (strategyName()) {
          <p class="lede">{{ strategyName() }} · {{ form.controls.timeframe.value }}</p>
        } @else {
          <app-page-guide
            description="Simulate how your strategy would have traded over a date range."
            [steps]="[
              'Paste or confirm the strategy ID from Strategy Lab.',
              'Pick a symbol and UTC date range that has price data.',
              'Run backtest and wait for the results page.',
            ]"
          />
        }
      </div>
      <a class="text-link" routerLink="/backtests">Back to history</a>
    </section>
    <form class="panel form-panel" [formGroup]="form" (ngSubmit)="submit()">
      <div class="field full">
        <label for="strategy">Strategy ID</label>
        <input id="strategy" formControlName="strategy_id" placeholder="Strategy ID" />
        @if (strategyLoading()) {
          <p class="hint" role="status">Loading strategy…</p>
        }
      </div>
      <div class="field">
        <app-symbol-search
          formControlName="symbol"
          [assetType]="assetType()"
          inputId="backtest-symbol"
        />
      </div>
      <div class="field">
        <label for="timeframe">Timeframe</label>
        <select id="timeframe" formControlName="timeframe">
          <option value="1d">1 day</option>
          <option value="1h">1 hour</option>
        </select>
      </div>
      <div class="field">
        <label for="start">Start date (UTC)</label>
        <input id="start" type="date" formControlName="start_date" />
      </div>
      <div class="field">
        <label for="end">End date (UTC, inclusive)</label>
        <input id="end" type="date" formControlName="end_date" />
      </div>
      <div class="field full">
        <label for="equity">Initial equity</label>
        <input id="equity" type="number" min="0.01" step="0.01" formControlName="initial_equity" />
      </div>
      @if (error()) {
        <p class="error full" role="alert">{{ error() }}</p>
      }
      <div class="actions full">
        <button
          class="button primary"
          type="submit"
          [disabled]="form.invalid || busy() || !strategyResolved()"
        >
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
  protected readonly strategyName = signal('');
  protected readonly strategyLoading = signal(false);
  protected readonly strategyResolved = signal(false);
  protected readonly assetType = signal<'EQUITY' | 'CRYPTO' | ''>('');
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
  private readonly strategiesApi = inject(StrategiesApiService);
  private readonly router = inject(Router);

  constructor() {
    this.form.controls.timeframe.disable({ emitEvent: false });
    this.form.controls.strategy_id.valueChanges
      .pipe(
        map((id) => id.trim()),
        distinctUntilChanged(),
        switchMap((id) => {
          this.strategyName.set('');
          this.assetType.set('');
          this.strategyResolved.set(false);
          this.form.controls.timeframe.setValue('1d', { emitEvent: false });
          this.error.set('');
          this.strategyLoading.set(Boolean(id));
          if (!id) return of(null);

          return timer(250).pipe(
            switchMap(() => this.strategiesApi.get(id)),
            catchError((error: unknown) => {
              this.error.set(error instanceof Error ? error.message : 'Unable to load strategy.');
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((strategy) => {
        this.strategyLoading.set(false);
        if (!strategy) return;
        this.strategyName.set(strategy.name);
        this.assetType.set(strategy.asset_type);
        this.form.controls.timeframe.setValue(strategy.timeframe, { emitEvent: false });
        this.strategyResolved.set(true);
      });

    const strategyId = inject(ActivatedRoute).snapshot.queryParamMap.get('strategy_id');
    if (strategyId) {
      this.form.controls.strategy_id.setValue(strategyId);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy() || !this.strategyResolved()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const values = this.form.getRawValue();
      const response = await firstValueFrom(
        this.api.create({ ...values, strategy_id: values.strategy_id.trim() }),
      );
      await this.router.navigate(['/backtests', response.run.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The backtest could not be run.');
    } finally {
      this.busy.set(false);
    }
  }
}
