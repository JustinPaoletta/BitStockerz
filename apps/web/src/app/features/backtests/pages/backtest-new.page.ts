import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
              'Choose a saved strategy from Strategy Lab.',
              'Choose sizing, costs, and fill timing. Use a new date range for out-of-sample validation.',
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
        <label for="strategy">Saved strategy</label>
        <select id="strategy" formControlName="strategy_id">
          <option value="">Choose a strategy</option>
          @for (item of availableStrategies(); track item.id) {
            <option [value]="item.id">{{ item.name }}</option>
          }
        </select>
        @if (!availableStrategies().length && !strategyLoading()) {
          <p class="hint">
            Start with a <a routerLink="/strategies/new">starter strategy</a>, then return here.
          </p>
        }
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
      <div class="field">
        <label for="allocation">Equity allocation %</label
        ><input
          id="allocation"
          type="number"
          min="0.01"
          max="100"
          formControlName="allocation_pct"
        />
      </div>
      <div class="field">
        <label for="commission">Commission (basis points per side)</label
        ><input id="commission" type="number" min="0" max="1000" formControlName="commission_bps" />
        <p class="hint">10 basis points = 0.1% of each fill.</p>
      </div>
      <div class="field">
        <label for="slippage">Slippage (basis points per side)</label
        ><input id="slippage" type="number" min="0" max="1000" formControlName="slippage_bps" />
      </div>
      <div class="field">
        <label for="timing">Fill timing</label
        ><select id="timing" formControlName="execution_timing">
          <option value="signal_close">Signal bar close</option>
          <option value="next_open">Next bar open</option>
        </select>
      </div>
      <div class="field full">
        <label for="evaluation">Evaluation period</label
        ><select id="evaluation" formControlName="evaluation_period">
          <option value="research">Research / tuning</option>
          <option value="out_of_sample">Out of sample</option>
        </select>
        <p class="hint">
          For out-of-sample validation, choose dates you did not use to tune this strategy. This
          label does not automatically enforce a split.
        </p>
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
  changeDetection: ChangeDetectionStrategy.Eager,
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
  protected readonly availableStrategies = signal<{ id: string; name: string }[]>([]);
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
    allocation_pct: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01), Validators.max(100)],
    }),
    commission_bps: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    slippage_bps: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(1000)],
    }),
    execution_timing: new FormControl<'signal_close' | 'next_open'>('signal_close', {
      nonNullable: true,
    }),
    evaluation_period: new FormControl<'research' | 'out_of_sample'>('research', {
      nonNullable: true,
    }),
    initial_equity: new FormControl(10000, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0.01)],
    }),
  });
  private readonly api = inject(BacktestsApiService);
  private readonly strategiesApi = inject(StrategiesApiService);
  private readonly router = inject(Router);

  constructor() {
    void this.loadStrategies();
    const end = new Date();
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 90);
    this.form.controls.start_date.setValue(start.toISOString().slice(0, 10));
    this.form.controls.end_date.setValue(end.toISOString().slice(0, 10));
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

    const query = inject(ActivatedRoute).snapshot.queryParamMap;
    for (const key of ['symbol', 'start_date', 'end_date'] as const) {
      const value = query.get(key);
      if (value) this.form.controls[key].setValue(value);
    }
    const strategyId = query.get('strategy_id');
    if (strategyId) {
      this.form.controls.strategy_id.setValue(strategyId);
    }
  }

  private async loadStrategies(): Promise<void> {
    try {
      let offset = 0;
      const all: { id: string; name: string }[] = [];
      for (;;) {
        const page = await firstValueFrom(this.strategiesApi.list(100, offset));
        all.push(...page.items);
        if (!page.has_more) break;
        offset += page.items.length;
        if (!page.items.length) break;
      }
      this.availableStrategies.set(all);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to list strategies.');
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy() || !this.strategyResolved()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const values = this.form.getRawValue();
      const response = await firstValueFrom(
        this.api.create({
          strategy_id: values.strategy_id.trim(),
          symbol: values.symbol,
          timeframe: values.timeframe,
          start_date: values.start_date,
          end_date: values.end_date,
          initial_equity: values.initial_equity,
          simulation: {
            allocation_pct: values.allocation_pct,
            commission_bps: values.commission_bps,
            slippage_bps: values.slippage_bps,
            execution_timing: values.execution_timing,
            evaluation_period: values.evaluation_period,
          },
        }),
      );
      await this.router.navigate(['/backtests', response.run.id]);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The backtest could not be run.');
    } finally {
      this.busy.set(false);
    }
  }
}
