import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BacktestsApiService } from '../backtests-api.service';
import type { BacktestListItem } from '../models/backtest.models';

@Component({
  selector: 'app-backtest-list-page',
  imports: [DatePipe, DecimalPipe, RouterLink],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Research history</p>
        <h1>Backtests</h1>
        <p class="lede">
          Review recent runs or start a new test against seeded or persisted market data.
        </p>
      </div>
      <a class="button primary" routerLink="/backtests/new">Run backtest</a>
    </section>

    @if (loading()) {
      <div class="panel state" aria-live="polite">Loading backtests…</div>
    } @else if (error()) {
      <div class="panel state error" role="alert">{{ error() }}</div>
    } @else if (items().length === 0) {
      <div class="panel state">
        <h2>No backtests yet</h2>
        <p>Your completed and in-progress runs will appear here.</p>
        <a class="button secondary" routerLink="/backtests/new">Create the first run</a>
      </div>
    } @else {
      <div class="run-grid">
        @for (item of items(); track item.id) {
          <a class="run-card panel" [routerLink]="['/backtests', item.id]">
            <div class="run-title">
              <div>
                <span class="symbol">{{ item.symbol }}</span>
                <h2>{{ item.strategy_name }}</h2>
              </div>
              <span class="status" [class]="item.status">{{ item.status }}</span>
            </div>
            <dl>
              <div>
                <dt>Return</dt>
                <dd
                  [class.positive]="number(item.total_return_pct) > 0"
                  [class.negative]="number(item.total_return_pct) < 0"
                >
                  {{
                    item.total_return_pct === undefined
                      ? '—'
                      : (number(item.total_return_pct) | number: '1.2-2') + '%'
                  }}
                </dd>
              </div>
              <div>
                <dt>Drawdown</dt>
                <dd>
                  {{
                    item.max_drawdown_pct === undefined
                      ? '—'
                      : (number(item.max_drawdown_pct) | number: '1.2-2') + '%'
                  }}
                </dd>
              </div>
              <div>
                <dt>Trades</dt>
                <dd>{{ item.num_trades ?? '—' }}</dd>
              </div>
            </dl>
            <p class="meta">{{ item.timeframe }} · {{ item.created_at | date: 'medium' }}</p>
          </a>
        }
      </div>
    }
  `,
  styles: `
    .run-grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
    }
    .run-card {
      color: inherit;
      display: block;
      padding: 1.35rem;
      text-decoration: none;
      transition:
        border-color 0.2s,
        transform 0.2s;
    }
    .run-card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }
    .run-title {
      align-items: flex-start;
      display: flex;
      justify-content: space-between;
      gap: 1rem;
    }
    .run-title h2 {
      font-size: 1.05rem;
      margin: 0.2rem 0 0;
    }
    .symbol {
      color: var(--accent);
      font-size: 1.5rem;
      font-weight: 750;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: 1.5rem 0;
    }
    dl div {
      border-right: 1px solid var(--border);
      padding-right: 0.7rem;
    }
    dl div + div {
      padding-left: 0.7rem;
    }
    dl div:last-child {
      border-right: 0;
    }
    dt {
      color: var(--muted);
      font-size: 0.75rem;
    }
    dd {
      font-size: 1.05rem;
      font-weight: 700;
      margin: 0.3rem 0 0;
    }
  `,
})
export class BacktestListPage implements OnInit {
  protected readonly items = signal<BacktestListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private readonly api = inject(BacktestsApiService);

  async ngOnInit(): Promise<void> {
    try {
      this.items.set((await firstValueFrom(this.api.list())).items);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load backtests.');
    } finally {
      this.loading.set(false);
    }
  }

  protected number(value?: string): number {
    return value === undefined ? Number.NaN : Number(value);
  }
}
