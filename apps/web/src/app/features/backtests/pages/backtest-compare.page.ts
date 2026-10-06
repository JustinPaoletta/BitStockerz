import { Component, inject, signal } from '@angular/core';
import { DecimalPipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BacktestsApiService } from '../backtests-api.service';
import type { BacktestListItem } from '../models/backtest.models';

type Research = Awaited<
  ReturnType<
    typeof firstValueFrom<
      ReturnType<BacktestsApiService['research']> extends import('rxjs').Observable<infer T>
        ? T
        : never
    >
  >
>;

@Component({
  selector: 'app-backtest-compare-page',
  imports: [FormsModule, RouterLink, DecimalPipe, JsonPipe],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Research</p>
        <h1>Compare backtests</h1>
        <p class="lede">
          Compare versions and settings. Match symbols, dates, and simulation costs for a fair
          comparison.
        </p>
      </div>
      <a routerLink="/backtests">Back to history</a>
    </section>
    <section class="panel controls">
      <label
        >First run
        <select [(ngModel)]="left">
          <option value="">Choose a run</option>
          @for (run of runs(); track run.id) {
            <option [value]="run.id">
              {{ run.strategy_name }} · {{ run.symbol }} · {{ run.created_at }}
            </option>
          }
        </select></label
      >
      <label
        >Second run
        <select [(ngModel)]="right">
          <option value="">Choose a run</option>
          @for (run of runs(); track run.id) {
            <option [value]="run.id">
              {{ run.strategy_name }} · {{ run.symbol }} · {{ run.created_at }}
            </option>
          }
        </select></label
      >
      <button
        class="button primary"
        type="button"
        [disabled]="!left || !right || left === right || busy()"
        (click)="compare()"
      >
        {{ busy() ? 'Loading…' : 'Compare' }}
      </button>
      @if (hasMore()) {
        <button
          class="button secondary"
          type="button"
          (click)="loadRuns()"
          [disabled]="loadingRuns()"
        >
          Load more runs
        </button>
      }
    </section>
    @if (error()) {
      <p role="alert" class="error">{{ error() }}</p>
    }
    @if (results().length === 2) {
      @if (!matching()) {
        <p class="hint" role="status">
          These runs use different markets, date ranges, starting equity, or simulation assumptions.
          Their returns are not directly comparable.
        </p>
      }
      <div class="comparison">
        @for (item of results(); track item.run.id) {
          <section class="panel result">
            <h2>{{ item.run.symbol }} · v{{ item.version_number }}</h2>
            <p>
              {{ item.run.start_date.slice(0, 10) }} – {{ item.run.end_date.slice(0, 10) }} ·
              {{ item.run.timeframe }}
            </p>
            @if (item.results; as metrics) {
              <dl>
                <dt>Total return</dt>
                <dd>{{ number(metrics.total_return_pct) | number: '1.2-2' }}%</dd>
                <dt>Max drawdown</dt>
                <dd>{{ number(metrics.max_drawdown_pct) | number: '1.2-2' }}%</dd>
                <dt>Win rate</dt>
                <dd>{{ number(metrics.win_rate_pct) | number: '1.2-2' }}%</dd>
                <dt>Trades</dt>
                <dd>{{ metrics.num_trades }}</dd>
              </dl>
              @if (metrics.benchmark) {
                <p>
                  Buy-and-hold: {{ number(metrics.benchmark.total_return_pct) | number: '1.2-2' }}%
                </p>
              }
            }
            <h3>Simulation settings</h3>
            <pre>{{ item.run.simulation ?? defaults | json }}</pre>
            <h3>Pinned strategy definition</h3>
            <pre>{{ item.definition | json }}</pre>
            <a [routerLink]="['/backtests', item.run.id]">View full results</a>
            <a
              class="button secondary"
              routerLink="/backtests/new"
              [queryParams]="{ strategy_id: item.run.strategy_id, symbol: item.run.symbol }"
              >Validate on another period</a
            >
          </section>
        }
      </div>
    }
  `,
  styles: `
    .controls {
      padding: 1.5rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 0.5rem;
      flex: 1;
      min-width: 200px;
    }
    .comparison {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin-top: 1rem;
    }
    .result {
      padding: 1.5rem;
    }
    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0 0 0.8rem;
    }
    @media (max-width: 700px) {
      .comparison {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class BacktestComparePage {
  private readonly api = inject(BacktestsApiService);
  readonly runs = signal<BacktestListItem[]>([]);
  readonly results = signal<Research[]>([]);
  readonly busy = signal(false);
  readonly loadingRuns = signal(false);
  readonly error = signal('');
  readonly hasMore = signal(true);
  readonly defaults = {
    allocation_pct: 100,
    commission_bps: 0,
    slippage_bps: 0,
    execution_timing: 'signal_close',
    evaluation_period: 'research',
  };
  left = inject(ActivatedRoute).snapshot.queryParamMap.get('left') ?? '';
  right = '';
  constructor() {
    void this.loadRuns();
  }
  async loadRuns(): Promise<void> {
    if (this.loadingRuns()) return;
    this.loadingRuns.set(true);
    try {
      const page = await firstValueFrom(this.api.list(50, this.runs().length));
      this.runs.update((items) => [...items, ...page.items]);
      this.hasMore.set(page.has_more);
    } catch {
      this.error.set('Unable to load runs. Please retry.');
    } finally {
      this.loadingRuns.set(false);
    }
  }
  async compare(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.results.set([]);
    try {
      this.results.set(
        await Promise.all([
          firstValueFrom(this.api.research(this.left)),
          firstValueFrom(this.api.research(this.right)),
        ]),
      );
    } catch {
      this.error.set('Unable to compare these runs.');
    } finally {
      this.busy.set(false);
    }
  }
  matching(): boolean {
    const [a, b] = this.results().map((item) => item.run);
    if (!a || !b) return false;
    const normalized = (item: typeof a) => {
      const settings = { ...this.defaults, ...item.simulation };
      return {
        allocation_pct: settings.allocation_pct,
        commission_bps: settings.commission_bps,
        slippage_bps: settings.slippage_bps,
        execution_timing: settings.execution_timing,
      };
    };
    return (
      a.symbol === b.symbol &&
      a.timeframe === b.timeframe &&
      a.start_date === b.start_date &&
      a.end_date === b.end_date &&
      a.initial_equity === b.initial_equity &&
      JSON.stringify(normalized(a)) === JSON.stringify(normalized(b))
    );
  }
  number(value: string): number {
    return Number(value);
  }
}
