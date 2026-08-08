import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BacktestKernelPanelComponent } from '../../ai/components/backtest-kernel-panel.component';
import { BacktestsApiService } from '../backtests-api.service';
import { EquityCurveChartComponent } from '../components/equity-curve-chart.component';
import { TradesTableComponent } from '../components/trades-table.component';
import type { BacktestDetailResponse, BacktestTrade } from '../models/backtest.models';

@Component({
  selector: 'app-backtest-detail-page',
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    EquityCurveChartComponent,
    TradesTableComponent,
    BacktestKernelPanelComponent,
  ],
  template: `
    @if (loading()) {
      <div class="panel state">Loading results…</div>
    } @else if (error()) {
      <div class="panel state error" role="alert">{{ error() }}</div>
    } @else if (detail(); as data) {
      <section class="page-heading">
        <div>
          <p class="eyebrow">{{ data.run.strategy_id }}</p>
          <h1>
            {{ data.run.symbol }} <span>{{ data.run.timeframe }}</span>
          </h1>
          <p class="lede">
            {{ data.run.start_date | date: 'mediumDate' : 'UTC' }} –
            {{ data.run.end_date | date: 'mediumDate' : 'UTC' }}
          </p>
        </div>
        <span class="status" [class]="data.run.status">{{ data.run.status }}</span>
      </section>

      @if (data.results; as results) {
        <section class="metric-grid" aria-label="Backtest metrics">
          <article>
            <span>Final equity</span
            ><strong>{{ number(results.final_equity) | number: '1.2-2' }}</strong>
          </article>
          <article>
            <span>Total return</span
            ><strong
              [class.positive]="number(results.total_return_pct) > 0"
              [class.negative]="number(results.total_return_pct) < 0"
              >{{ number(results.total_return_pct) | number: '1.2-2' }}%</strong
            >
          </article>
          <article>
            <span>Max drawdown</span
            ><strong>{{ number(results.max_drawdown_pct) | number: '1.2-2' }}%</strong>
          </article>
          <article>
            <span>Win rate</span
            ><strong>{{ number(results.win_rate_pct) | number: '1.2-2' }}%</strong>
          </article>
          <article>
            <span>Trades</span><strong>{{ results.num_trades }}</strong>
          </article>
          <article>
            <span>Sharpe</span
            ><strong>{{
              results.sharpe_ratio === null ? '—' : (number(results.sharpe_ratio) | number: '1.2-2')
            }}</strong>
          </article>
        </section>
        <section class="panel section-panel">
          <div class="section-title">
            <div>
              <p class="eyebrow">Portfolio value</p>
              <h2>Equity curve</h2>
            </div>
          </div>
          <app-equity-curve-chart [points]="data.equity_curve" [timeframe]="data.run.timeframe" />
        </section>

        <app-backtest-kernel-panel
          [strategyId]="data.run.strategy_id"
          [backtestRunId]="data.run.id"
        />
      } @else {
        <section class="panel state">
          <h2>Results are unavailable</h2>
          <p>{{ data.run.error_message ?? 'This run has not completed.' }}</p>
        </section>
      }

      <section class="panel section-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Executions</p>
            <h2>Trades</h2>
          </div>
          <span>{{ trades().length }} loaded</span>
        </div>
        <app-trades-table [trades]="trades()" />
        @if (data.trades_page.has_more) {
          <button
            class="button secondary load-more"
            type="button"
            [disabled]="loadingMore()"
            (click)="loadMore()"
          >
            {{ loadingMore() ? 'Loading…' : 'Load more trades' }}
          </button>
        }
      </section>
      <p class="meta">
        <a class="text-link" routerLink="/backtests">Back to all backtests</a> · Run
        {{ data.run.id }}
      </p>
    }
  `,
  styles: `
    .page-heading h1 span {
      color: var(--muted);
      font-size: 0.4em;
      letter-spacing: 0.04em;
      vertical-align: middle;
    }
    .section-panel {
      margin-top: 1.25rem;
      padding: clamp(1.1rem, 3vw, 2rem);
    }
    .section-title {
      align-items: end;
      display: flex;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }
    .section-title h2 {
      margin: 0.15rem 0 0;
    }
    .section-title > span {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .load-more {
      margin-top: 1.25rem;
    }
  `,
})
export class BacktestDetailPage implements OnInit {
  protected readonly detail = signal<BacktestDetailResponse | null>(null);
  protected readonly trades = signal<BacktestTrade[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal('');
  private readonly api = inject(BacktestsApiService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  async ngOnInit(): Promise<void> {
    try {
      const detail = await firstValueFrom(this.api.detail(this.id));
      this.detail.set(detail);
      this.trades.set(detail.trades);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load results.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadMore(): Promise<void> {
    const current = this.detail();
    if (!current?.trades_page.has_more || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      const page = await firstValueFrom(this.api.detail(this.id, 500, this.trades().length));
      const byId = new Map(this.trades().map((trade) => [trade.id, trade]));
      for (const trade of page.trades) byId.set(trade.id, trade);
      this.trades.set([...byId.values()]);
      this.detail.set({ ...current, trades_page: page.trades_page });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Unable to load more trades.');
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected number(value: string): number {
    return Number(value);
  }
}
