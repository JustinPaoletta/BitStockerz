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
          <p class="eyebrow">Backtest result</p>
          <h1>
            {{ data.run.strategy_name ?? 'Strategy' }}
            <span>
              {{
                data.run.strategy_version_number
                  ? 'Version ' + data.run.strategy_version_number
                  : 'Version ID ' + data.run.strategy_version_id
              }}
            </span>
          </h1>
          <p class="lede">
            {{ data.run.symbol }} · {{ data.run.timeframe === '1d' ? 'Daily' : 'Hourly' }}
          </p>
          <p class="lede">
            Test period: {{ data.run.start_date | date: 'mediumDate' : 'UTC' }} –
            {{ data.run.end_date | date: 'mediumDate' : 'UTC' }}
          </p>
          <app-page-guide
            description="Review simulated performance, compare it with buy and hold, and inspect closed trades."
          />
        </div>
        <span class="status" [class]="data.run.status">
          {{ data.run.status
          }}{{
            data.run.status === 'completed' && data.results?.num_trades === 0 ? ' · No trades' : ''
          }}
        </span>
      </section>

      @if (data.results?.num_trades === 0) {
        <section class="panel no-trades" role="status">
          <h2>Completed · No trades</h2>
          <p>
            No trades were recorded in this backtest.
            @if (
              data.results && number(data.results.final_equity) === number(data.run.initial_equity)
            ) {
              Equity remained unchanged.
            }
            Review the strategy rules, available data, and test settings.
          </p>
        </section>
      }

      <section class="panel source-note" aria-label="Backtest price source">
        @if (data.run.price_source === 'seed') {
          <strong>Demo backtest · Simulated prices</strong>
          <p>
            These results demonstrate the product. They do not show performance on historical market
            prices.
          </p>
        } @else if (data.run.price_source === 'alpaca') {
          <strong>Alpaca price data · Simulated trades</strong>
          <p>
            The prices came from the stored Alpaca feed; trades and account values are simulated.
          </p>
        } @else if (
          data.run.price_source === 'mixed_with_seed' ||
          data.run.price_source === 'unknown_with_seed'
        ) {
          <strong>Demo prices included · Mixed or incomplete sources</strong>
          <p>
            This result includes generated prices and does not show performance solely on historical
            market prices.
          </p>
        } @else if (data.run.price_source === 'mixed') {
          <strong>Mixed price sources</strong>
          <p>
            This run combined bars from more than one provider. Check the data before using the
            result.
          </p>
        } @else if (data.run.price_source && data.run.price_source !== 'unknown') {
          <strong>Price provider: {{ data.run.price_source }}</strong>
          <p>
            Verify the source before interpreting this result. Trades and account values are
            simulated.
          </p>
        } @else {
          <strong>Price source not recorded for this run</strong>
          <p>We cannot verify which provider supplied the bars used by this backtest.</p>
        }
      </section>

      @if (data.equity_curve.length) {
        <p class="data-coverage">
          Evaluated data: {{ data.equity_curve[0].timestamp | date: 'mediumDate' : 'UTC' }} –
          {{
            data.equity_curve[data.equity_curve.length - 1].timestamp | date: 'mediumDate' : 'UTC'
          }}
          ({{ data.equity_curve.length }}
          {{ data.run.timeframe === '1d' ? 'daily' : 'hourly' }} bars)
        </p>
      }

      <section class="panel section-panel">
        <h2>Simulation assumptions</h2>
        <dl class="assumptions">
          <div>
            <dt>Starting capital</dt>
            <dd>
              {{ number(data.run.initial_equity) | number: '1.2-2' }} {{ data.run.currency ?? '' }}
            </dd>
          </div>
          <div>
            <dt>Position size</dt>
            <dd>{{ data.run.simulation?.allocation_pct ?? 100 }}% of available cash</dd>
          </div>
          <div>
            <dt>Commission</dt>
            <dd>
              {{ basisPointsPercent(data.run.simulation?.commission_bps ?? 0) }}% of each buy and
              sell
            </dd>
          </div>
          <div>
            <dt>Slippage</dt>
            <dd>{{ basisPointsPercent(data.run.simulation?.slippage_bps ?? 0) }}% per fill</dd>
          </div>
          <div>
            <dt>Fill timing</dt>
            <dd>
              {{
                data.run.simulation?.execution_timing === 'next_open'
                  ? 'Next bar open'
                  : 'Signal bar close'
              }}
            </dd>
          </div>
          <div>
            <dt>Purpose</dt>
            <dd>
              {{
                data.run.simulation?.evaluation_period === 'out_of_sample'
                  ? 'Out-of-sample (user-labeled)'
                  : 'Research'
              }}
            </dd>
          </div>
          <div>
            <dt>Direction</dt>
            <dd>Long only</dd>
          </div>
        </dl>
        <p class="hint">
          {{
            data.run.simulation?.execution_timing === 'next_open'
              ? 'Signals use completed bars and orders fill at the next bar’s open.'
              : 'Signals use the closing price and fill at that same close; this is an idealized execution assumption.'
          }}
          If a bar reaches both the stop-loss and take-profit levels, the simulation applies the
          stop-loss first. Any open position closes at the final bar’s close, with the selected fees
          and slippage.
        </p>
        @if (data.run.simulation?.evaluation_period === 'out_of_sample') {
          <p class="hint">
            Use this label only for data that was not used to develop or tune the strategy. The app
            does not enforce that separation.
          </p>
        }
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
            >Set up a new backtest</a
          >
          <a
            class="button secondary"
            routerLink="/backtests/compare"
            [queryParams]="{ left: data.run.id }"
            >Compare backtests</a
          >
          <button class="button secondary" type="button" (click)="exportTrades()">
            Export all trades (CSV)</button
          ><button class="button secondary" type="button" (click)="exportResults()">
            Export results (CSV)
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
            ><strong
              >{{ number(results.final_equity) | number: '1.2-2' }}
              {{ data.run.currency ?? '' }}</strong
            >
            <small
              >Starting capital: {{ number(data.run.initial_equity) | number: '1.2-2' }}
              {{ data.run.currency ?? '' }}</small
            >
          </article>
          <article>
            <span>Total return</span
            ><strong
              [class.positive]="number(results.total_return_pct) > 0"
              [class.negative]="number(results.total_return_pct) < 0"
              >{{ number(results.total_return_pct) | number: '1.2-2' }}%</strong
            >
            <small>Change in equity during this test.</small>
          </article>
          <article>
            <span>Maximum drawdown</span
            ><strong>{{ number(results.max_drawdown_pct) | number: '1.2-2' }}%</strong>
            <small>Largest fall from an earlier equity peak.</small>
          </article>
          <article>
            <span>Win rate</span
            ><strong>{{
              results.num_trades === 0 || results.win_rate_pct === null
                ? '—'
                : (number(results.win_rate_pct) | number: '1.2-2') + '%'
            }}</strong>
            @if (results.num_trades === 0) {
              <small>No closed trades.</small>
            }
          </article>
          <article>
            <span>Closed trades</span><strong>{{ results.num_trades }}</strong>
            <small>One completed entry and exit per trade.</small>
          </article>
          <article>
            <span>Sharpe ratio</span
            ><strong>{{
              results.sharpe_ratio === null ? '—' : (number(results.sharpe_ratio) | number: '1.2-2')
            }}</strong>
            @if (results.sharpe_ratio === null) {
              <small>{{ sharpeUnavailableReason(data.equity_curve) }}</small>
            }
          </article>
        </section>
        @if (results.benchmark; as benchmark) {
          <section class="panel section-panel">
            <h2>Buy-and-hold comparison</h2>
            <p>
              Buy-and-hold return:
              {{ number(benchmark.total_return_pct) > 0 ? '+' : ''
              }}{{ number(benchmark.total_return_pct) | number: '1.2-2' }}% · Difference from buy
              and hold:
              {{
                number(results.total_return_pct) - number(benchmark.total_return_pct)
                  | number: '1.2-2'
              }}
              percentage points.
            </p>
            <p class="hint">
              Same price bars, starting capital, allocation, commission, and slippage. The benchmark
              buys at
              {{
                data.run.simulation?.execution_timing === 'next_open'
                  ? 'the second bar’s open'
                  : 'the first bar’s close'
              }}
              and includes estimated sale costs at the final bar’s close.
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
              <h2>Equity curve</h2>
              <p class="hint">
                Simulated account value over time{{
                  data.run.currency ? ' (' + data.run.currency + ')' : ''
                }}.
              </p>
            </div>
          </div>
          @if (trades().length) {
            <p class="marker-legend">
              <span class="entry">↑ Entry</span> · <span class="exit">↓ Exit</span>
            </p>
          }
          <app-equity-curve-chart
            [points]="data.equity_curve"
            [timeframe]="data.run.timeframe"
            [trades]="trades()"
          />
          @if (data.trades_page.has_more) {
            <p class="marker-note" role="status">
              Markers cover {{ trades().length }} of {{ results.num_trades }} closed trades. Load
              more trades below to show the remaining entries and exits.
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
            <h2>Closed trades</h2>
          </div>
          <span>
            @if (data.trades_page.has_more && data.results) {
              Showing {{ trades().length }} of {{ data.results.num_trades }} closed trades
            } @else {
              {{ trades().length }} closed trades
            }
          </span>
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
        <a class="text-link" routerLink="/backtests">Back to all backtests</a> · Run ID:
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
    .no-trades,
    .source-note {
      margin-bottom: 1rem;
      padding: 1rem 1.25rem;
    }
    .no-trades h2,
    .source-note p {
      margin: 0;
    }
    .no-trades p,
    .source-note p {
      margin-top: 0.4rem;
    }
    .source-note strong {
      color: var(--accent-text);
    }
    .data-coverage {
      color: var(--muted);
      font-size: 0.9rem;
    }
    .assumptions {
      display: grid;
      gap: 0.8rem 1.25rem;
      grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
      margin: 1rem 0;
    }
    .assumptions dt {
      color: var(--muted);
      font-size: 0.8rem;
    }
    .assumptions dd {
      margin: 0.15rem 0 0;
    }
    .metric-grid small {
      color: var(--muted);
      display: block;
      font-size: 0.75rem;
      line-height: 1.35;
      margin-top: 0.4rem;
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
      color: var(--accent-text);
    }
    .exit {
      color: var(--secondary-accent-text);
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
      await downloadText('backtest-results.csv', await firstValueFrom(this.api.exportResults(id)));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Export failed.');
    }
  }
  protected async exportTrades(): Promise<void> {
    this.exportError.set('');
    try {
      await downloadText(
        'backtest-trades.csv',
        await firstValueFrom(this.api.exportTrades(this.id)),
      );
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

  protected number(value: string | null): number {
    return value === null ? Number.NaN : Number(value);
  }

  protected basisPointsPercent(basisPoints: number): string {
    return String(Number((basisPoints / 100).toFixed(4)));
  }

  protected sharpeUnavailableReason(points: { equity: string }[]): string {
    if (points.length < 3) return 'Too few equity points to calculate.';
    if (points.every((point) => point.equity === points[0].equity)) {
      return 'No variation in bar-to-bar returns.';
    }
    return 'Unavailable for this equity series.';
  }
}
