import { DatePipe, DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { PageGuideComponent } from '../../../shared/ui/page-guide.component';
import { BacktestsApiService } from '../backtests-api.service';
import type { BacktestListItem } from '../models/backtest.models';

@Component({
  selector: 'app-backtest-list-page',
  imports: [DatePipe, DecimalPipe, RouterLink, PageGuideComponent, InlineErrorComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Research history</p>
        <a class="text-link" routerLink="/backtests/compare">Compare runs</a>
        <h1>Backtests</h1>
        <app-page-guide
          description="Backtests replay one of your strategies on historical prices and show equity, metrics, and every simulated trade."
          [steps]="[
            'Pick a strategy (from Strategy Lab or the Run backtest button).',
            'Choose symbol, dates, and starting equity, then run.',
            'Open a finished run to review the chart and trade list.',
          ]"
        />
      </div>
      <a class="button primary" routerLink="/backtests/new">Run backtest</a>
    </section>

    @if (error()) {
      <app-inline-error [message]="error()" (retry)="load()" />
    }
    <div [attr.aria-busy]="loading()">
      @if (loading() && items().length === 0) {
        <div class="panel state" aria-live="polite">Loading backtests…</div>
      } @else if (!loading() && !error() && items().length === 0) {
        <div class="panel state">
          <h2>{{ offset() === 0 ? 'No backtests yet' : 'No backtests on this page' }}</h2>
          <p>
            {{
              offset() === 0
                ? 'Use Run backtest above. Your completed and in-progress runs will appear here.'
                : 'Use Previous to return to your backtests.'
            }}
          </p>
        </div>
      } @else if (items().length > 0) {
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
    </div>
    @if (items().length > 0 || offset() > 0) {
      <nav class="pagination" aria-label="Backtest pages">
        <button
          class="button secondary"
          type="button"
          [disabled]="loading() || offset() === 0"
          (click)="previousPage()"
        >
          Previous
        </button>
        <span role="status">
          @if (loading()) {
            Loading page {{ requestedOffset / pageSize + 1 }}…
          } @else {
            Page {{ offset() / pageSize + 1 }}
          }
        </span>
        <button
          class="button secondary"
          type="button"
          [disabled]="loading() || !hasMore()"
          (click)="nextPage()"
        >
          Next
        </button>
      </nav>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
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
    .run-card:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 4px;
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
      font-weight: 600;
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
      font-weight: 600;
      margin: 0.3rem 0 0;
    }
    .pagination {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      justify-content: space-between;
      margin-top: 1rem;
    }
    .pagination span {
      color: var(--muted);
    }
    app-inline-error {
      display: block;
      margin-bottom: 1rem;
    }
  `,
})
export class BacktestListPage implements OnInit {
  protected readonly items = signal<BacktestListItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly offset = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly pageSize = 50;
  protected requestedOffset = 0;
  private readonly api = inject(BacktestsApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.load();
  }

  protected previousPage(): void {
    if (!this.loading() && this.offset() > 0) this.load(this.offset() - this.pageSize);
  }

  protected nextPage(): void {
    if (!this.loading() && this.hasMore()) this.load(this.offset() + this.pageSize);
  }

  protected load(offset = this.requestedOffset): void {
    this.requestedOffset = offset;
    this.loading.set(true);
    this.error.set('');
    this.api
      .list(this.pageSize, offset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.items.set(response.items);
          this.offset.set(offset);
          this.hasMore.set(response.has_more);
          this.loading.set(false);
        },
        error: (error: Error) => {
          this.error.set(`Could not load page ${offset / this.pageSize + 1}. ${error.message}`);
          this.loading.set(false);
        },
      });
  }

  protected number(value?: string): number {
    return value === undefined ? Number.NaN : Number(value);
  }
}
