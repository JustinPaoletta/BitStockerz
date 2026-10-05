import { downloadText } from '../../../shared/format/download';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { BacktestKernelPanelComponent } from '../../ai/components/backtest-kernel-panel.component';
import { PageGuideComponent } from '../../../shared/ui/page-guide.component';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
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
    PageGuideComponent,
    InlineErrorComponent,
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
          <app-page-guide
            description="Review final equity, drawdown-style metrics, the equity curve, and each simulated fill."
          />
        </div>
        <span class="status" [class]="data.run.status">{{ data.run.status }}</span>
      </section>

      <section class="panel section-panel">
        <h2>Simulation assumptions</h2>
        <p>
          {{ data.run.simulation?.allocation_pct ?? 100 }}% equity allocation ·
          {{ data.run.simulation?.commission_bps ?? 0 }} bps commission per side ·
          {{ data.run.simulation?.slippage_bps ?? 0 }} bps slippage per side ·
          {{
            data.run.simulation?.execution_timing === 'next_open'
              ? 'Next bar open'
              : 'Signal bar close'
          }}
          ·
          {{
            data.run.simulation?.evaluation_period === 'out_of_sample'
              ? 'Out-of-sample period'
              : 'Research period'
          }}
        </p>
        <p class="hint">
          Long only. Risk exits use stop-first when both thresholds are reached; remaining positions
          close at the final bar. Out-of-sample labels are user-selected.
        </p>
        <div class="actions">
          <a
            class="button secondary"
            routerLink="/backtests/new"
            [queryParams]="{
              strategy_id: data.run.strategy_id,
              symbol: data.run.symbol,
              start_date: data.run.start_date.slice(0, 10),
              end_date: data.run.end_date.slice(0, 10),
            }"
            >Test latest strategy version</a
          >
          <a
            class="button secondary"
            routerLink="/backtests/compare"
            [queryParams]="{ left: data.run.id }"
            >Compare runs</a
          >
          <button class="button secondary" type="button" (click)="exportTrades()">
            Export all trades CSV</button
          ><button class="button secondary" type="button" (click)="exportResults()">
            Export results CSV
          </button>
        </div>
        @if (exportError()) {
          <p class="error" role="alert">{{ exportError() }}</p>
        }
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
        @if (results.benchmark; as benchmark) {
          <section class="panel section-panel">
            <h2>Buy-and-hold comparison</h2>
            <p>
              Buy-and-hold return: {{ number(benchmark.total_return_pct) | number: '1.2-2' }}% ·
              Strategy relative return:
              {{
                number(results.total_return_pct) - number(benchmark.total_return_pct)
                  | number: '1.2-2'
              }}
              percentage points.
            </p>
            <p class="hint">
              Same bars, allocation, fees, and slippage. Buy at the first close (second open for
              next-open runs), hold through the final close.
            </p>
            <app-equity-curve-chart
              [points]="benchmark.equity_curve"
              [timeframe]="data.run.timeframe"
            />
          </section>
        }
        <section class="panel section-panel">
          <div class="section-title">
            <div>
              <p class="eyebrow">Portfolio value</p>
              <h2>Equity curve</h2>
            </div>
          </div>
          <p class="marker-legend">
            <span class="entry">↑ Entry</span> · <span class="exit">↓ Exit</span>
            · Markers show trade timing. Fill prices are listed below.
          </p>
          <app-equity-curve-chart
            [points]="data.equity_curve"
            [timeframe]="data.run.timeframe"
            [trades]="trades()"
          />
          @if (data.trades_page.has_more) {
            <p class="marker-note" role="status">
              Markers cover {{ trades().length }} of {{ results.num_trades }} trades. Load more
              trades below to show the remaining entries and exits.
            </p>
          }
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
        @if (loadMoreError()) {
          <div class="load-more">
            <app-inline-error [message]="loadMoreError()" (retry)="loadMore()" />
          </div>
        } @else if (data.trades_page.has_more) {
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
  changeDetection: ChangeDetectionStrategy.Eager,
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
    .marker-legend,
    .marker-note {
      color: var(--muted);
      font-size: 0.85rem;
    }
    .entry {
      color: #d7f86b;
    }
    .exit {
      color: #ffad75;
    }
  `,
})
export class BacktestDetailPage implements OnInit {
  protected readonly exportError = signal('');
  protected readonly detail = signal<BacktestDetailResponse | null>(null);
  protected readonly trades = signal<BacktestTrade[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly loadMoreError = signal('');
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

  protected async exportResults(): Promise<void> {
    const id = this.detail()?.run.id;
    if (!id) return;
    try {
      downloadText('backtest-results.csv', await firstValueFrom(this.api.exportResults(id)));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Export failed.');
    }
  }
  protected async exportTrades(): Promise<void> {
    this.exportError.set('');
    try {
      downloadText('backtest-trades.csv', await firstValueFrom(this.api.exportTrades(this.id)));
    } catch (error) {
      this.exportError.set(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  protected async loadMore(): Promise<void> {
    const current = this.detail();
    if (!current?.trades_page.has_more || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.loadMoreError.set('');
    try {
      const page = await firstValueFrom(this.api.detail(this.id, 500, this.trades().length));
      const byId = new Map(this.trades().map((trade) => [trade.id, trade]));
      for (const trade of page.trades) byId.set(trade.id, trade);
      this.trades.set([...byId.values()]);
      this.detail.set({ ...current, trades_page: page.trades_page });
    } catch (error) {
      this.loadMoreError.set(
        error instanceof Error ? error.message : 'Unable to load more trades.',
      );
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected number(value: string): number {
    return Number(value);
  }
}
