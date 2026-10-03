import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { BsCurrencyPipe, BsDateTimePipe } from '../../shared/format/display.pipes';
import { BsCardComponent } from '../../shared/ui/bs-card.component';
import { InlineErrorComponent } from '../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import {
  SymbolSearchComponent,
  SymbolSearchResult,
} from '../../shared/symbols/symbol-search.component';
import { BacktestsApiService } from '../backtests/backtests-api.service';
import { StrategiesApiService } from '../strategies/data/strategies-api.service';
import {
  ExecutionRow,
  PortfolioSummary,
  PositionRow,
  TradingApiService,
} from '../trading/data/trading-api.service';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    BsCardComponent,
    SkeletonComponent,
    InlineErrorComponent,
    SymbolSearchComponent,
    BsCurrencyPipe,
    BsDateTimePipe,
    DecimalPipe,
  ],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1>Trading Workspace</h1>
        <p class="lede">Your portfolio, strategies, and latest paper trading activity.</p>
      </div>
      <div class="dashboard-search">
        <app-symbol-search
          label="Find a symbol to trade"
          inputId="dashboard-symbol"
          (selected)="openSymbol($event)"
        />
      </div>
    </section>

    <div class="dashboard-grid">
      <app-bs-card
        class="portfolio-card"
        eyebrow="Paper account"
        title="Portfolio summary"
        description="Simulated funds. Your equity includes cash and open positions."
      >
        @switch (accountState()) {
          @case ('loading') {
            <app-skeleton height="7rem" />
          }
          @case ('error') {
            <app-inline-error [message]="accountError()" (retry)="loadAccount()" />
          }
          @case ('ready') {
            @if (account(); as summary) {
              <div class="metric-grid compact">
                <article>
                  <span>Cash</span><strong>{{ summary.cash_balance | bsCurrency }}</strong>
                </article>
                <article>
                  <span>Equity</span><strong>{{ summary.total_equity | bsCurrency }}</strong>
                </article>
                <article>
                  <span>Unrealized P&amp;L</span>
                  <strong
                    [class.positive]="signedNumber(summary.unrealized_pnl_total) > 0"
                    [class.negative]="signedNumber(summary.unrealized_pnl_total) < 0"
                  >
                    {{ summary.unrealized_pnl_total | bsCurrency }}
                    <span class="sr-only">
                      {{
                        signedNumber(summary.unrealized_pnl_total) > 0
                          ? 'gain'
                          : signedNumber(summary.unrealized_pnl_total) < 0
                            ? 'loss'
                            : 'no change'
                      }}
                    </span>
                  </strong>
                </article>
                <article>
                  <span>Realized P&amp;L</span>
                  <strong
                    [class.positive]="signedNumber(summary.realized_pnl_total) > 0"
                    [class.negative]="signedNumber(summary.realized_pnl_total) < 0"
                  >
                    {{ summary.realized_pnl_total | bsCurrency }}
                    <span class="sr-only">{{
                      signedNumber(summary.realized_pnl_total) > 0
                        ? 'gain'
                        : signedNumber(summary.realized_pnl_total) < 0
                          ? 'loss'
                          : 'no change'
                    }}</span>
                  </strong>
                </article>
                <article>
                  <span>Total P&amp;L</span>
                  <strong
                    [class.positive]="signedNumber(summary.total_pnl) > 0"
                    [class.negative]="signedNumber(summary.total_pnl) < 0"
                    >{{ summary.total_pnl | bsCurrency }}</strong
                  >
                </article>
              </div>
            }
          }
        }
      </app-bs-card>

      <app-bs-card
        eyebrow="Book"
        title="Positions"
        description="Symbols you hold now. Open Trade to buy more or sell."
      >
        @switch (positionsState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="positionsError()" (retry)="loadPositions()" />
          }
          @case ('empty') {
            <div class="empty-widget">
              <h3>No open positions</h3>
              <p>Use Trade to place your first paper order.</p>
            </div>
          }
          @case ('ready') {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Qty</th>
                    <th>Avg cost</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of positions(); track row.symbol) {
                    <tr>
                      <td>{{ row.symbol }}</td>
                      <td>{{ row.quantity | number: '1.0-8' }}</td>
                      <td>{{ row.avg_cost | bsCurrency }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </app-bs-card>

      <app-bs-card
        eyebrow="Lab"
        title="Strategies"
        description="Trading rules you define. Edit a strategy or start a backtest from here."
      >
        @switch (strategiesState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="strategiesError()" (retry)="loadStrategies()" />
          }
          @case ('empty') {
            <div class="empty-widget">
              <h3>No strategies yet</h3>
              <p>Define your trading rules, then test them on historical prices.</p>
              <a class="text-link" routerLink="/strategies/new">Create a strategy</a>
            </div>
          }
          @case ('ready') {
            <ul class="link-list">
              @for (item of strategies(); track item.id) {
                <li>
                  <a class="item-link" [routerLink]="['/strategies', item.id]">{{ item.name }}</a>
                  <div class="row-actions">
                    <a class="text-link" [routerLink]="['/strategies', item.id, 'edit']">Edit</a>
                    <a
                      class="text-link"
                      [routerLink]="['/backtests/new']"
                      [queryParams]="{ strategy_id: item.id }"
                      >Run backtest</a
                    >
                  </div>
                </li>
              }
            </ul>
          }
        }
      </app-bs-card>

      <app-bs-card
        eyebrow="Research"
        title="Recent backtests"
        description="Past simulation runs. Open one to see equity curve and trades."
      >
        @switch (backtestsState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="backtestsError()" (retry)="loadBacktests()" />
          }
          @case ('empty') {
            <div class="empty-widget">
              <h3>No backtests yet</h3>
              <p>Open a strategy and choose Run backtest to see how it performs.</p>
            </div>
          }
          @case ('ready') {
            <ul class="link-list">
              @for (item of backtests(); track item.id) {
                <li>
                  <a class="item-link" [routerLink]="['/backtests', item.id]"
                    >{{ item.strategy_name }} · {{ item.symbol }}</a
                  >
                  <span class="meta">{{ item.status }} · {{ item.created_at | bsDateTime }}</span>
                </li>
              }
            </ul>
          }
        }
      </app-bs-card>

      <app-bs-card
        eyebrow="Activity"
        title="Recent trades"
        description="Latest filled paper orders from the trade desk."
      >
        @switch (tradesState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="tradesError()" (retry)="loadTrades()" />
          }
          @case ('empty') {
            <div class="empty-widget">
              <h3>No trades yet</h3>
              <p>Your filled paper orders will appear here.</p>
            </div>
          }
          @case ('ready') {
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Qty</th>
                    <th>Price</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of trades(); track $index) {
                    <tr>
                      <td>{{ row.executed_at | bsDateTime }}</td>
                      <td>{{ row.symbol }}</td>
                      <td>{{ row.side }}</td>
                      <td>{{ row.quantity | number: '1.0-8' }}</td>
                      <td>{{ row.price | bsCurrency }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </app-bs-card>
    </div>
  `,
  styles: `
    .page-heading {
      align-items: center;
    }
    .page-heading > div {
      min-width: 0;
    }
    .page-heading h1 {
      font-size: clamp(2rem, 4vw, 3rem);
    }
    .lede {
      margin-bottom: 0;
    }
    .dashboard-search {
      flex: 0 1 19rem;
      min-width: 15rem;
    }
    .portfolio-card {
      grid-column: 1 / -1;
    }
    app-bs-card {
      min-width: 0;
    }
    .metric-grid strong {
      font-size: clamp(1.25rem, 2vw, 1.7rem);
      overflow-wrap: anywhere;
    }
    .empty-widget {
      padding: 0.6rem 0 0.3rem;
    }
    .empty-widget h3 {
      font-size: 1rem;
      margin: 0 0 0.5rem;
    }
    .empty-widget p {
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.55;
      margin: 0;
    }
    .empty-widget a {
      display: inline-block;
      margin-top: 0.65rem;
      padding-block: 0.35rem;
    }
    .item-link {
      color: var(--text);
      font-weight: 600;
      text-underline-offset: 0.2em;
      overflow-wrap: anywhere;
    }
    .item-link:hover {
      color: var(--accent);
    }
    .table-wrap table {
      min-width: 0;
    }
    .table-wrap th,
    .table-wrap td {
      padding: 0.75rem 0.45rem;
    }
    .dashboard-grid {
      display: grid;
      gap: 1.25rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .metric-grid.compact {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin: 0;
    }
    .link-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .link-list li {
      border-bottom: 1px solid var(--border);
      display: grid;
      gap: 0.35rem;
      padding: 0.75rem 0;
    }
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.85rem;
    }
    .sr-only {
      clip: rect(0 0 0 0);
      height: 1px;
      overflow: hidden;
      position: absolute;
      width: 1px;
    }
    @media (max-width: 650px) {
      .page-heading {
        align-items: stretch;
        flex-direction: column;
        gap: 1rem;
      }
      .dashboard-search {
        flex: auto;
        min-width: 0;
      }
      .metric-grid.compact {
        grid-template-columns: 1fr;
        gap: 0.5rem;
      }
      .metric-grid article {
        border-radius: 0.65rem;
        padding: 1rem;
      }
      .metric-grid strong {
        font-size: 1.4rem;
      }
    }
    @media (max-width: 900px) {
      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DashboardPage implements OnInit {
  protected readonly account = signal<PortfolioSummary | null>(null);
  protected readonly accountState = signal<LoadState>('loading');
  protected readonly accountError = signal('Failed to load account summary.');
  protected readonly positions = signal<PositionRow[]>([]);
  protected readonly positionsState = signal<LoadState>('loading');
  protected readonly positionsError = signal('Failed to load positions.');
  protected readonly strategies = signal<
    { id: string; name: string; asset_type: string; timeframe: string }[]
  >([]);
  protected readonly strategiesState = signal<LoadState>('loading');
  protected readonly strategiesError = signal('Failed to load strategies.');
  protected readonly backtests = signal<
    {
      id: string;
      strategy_name: string;
      symbol: string;
      status: string;
      created_at: string;
    }[]
  >([]);
  protected readonly backtestsState = signal<LoadState>('loading');
  protected readonly backtestsError = signal('Failed to load backtests.');
  protected readonly trades = signal<ExecutionRow[]>([]);
  protected readonly tradesState = signal<LoadState>('loading');
  protected readonly tradesError = signal('Failed to load trades.');

  private readonly router = inject(Router);
  private readonly trading = inject(TradingApiService);
  private readonly strategiesApi = inject(StrategiesApiService);
  private readonly backtestsApi = inject(BacktestsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private widgetsRequested = false;

  ngOnInit(): void {
    if (this.widgetsRequested) {
      return;
    }
    this.widgetsRequested = true;
    this.loadAccount();
    this.loadPositions();
    this.loadStrategies();
    this.loadBacktests();
    this.loadTrades();
  }

  protected openSymbol(item: SymbolSearchResult): void {
    void this.router.navigate(['/trade'], { queryParams: { symbol: item.symbol } });
  }

  protected signedNumber(value: string): number {
    return Number(value);
  }

  protected loadAccount(): void {
    this.accountState.set('loading');
    this.trading
      .portfolioSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.account.set(value);
          this.accountState.set('ready');
        },
        error: (error: Error) => {
          this.accountError.set(error.message);
          this.accountState.set('error');
        },
      });
  }

  protected loadPositions(): void {
    this.positionsState.set('loading');
    this.trading
      .positions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          const rows = value.positions.slice(0, 5);
          this.positions.set(rows);
          this.positionsState.set(rows.length ? 'ready' : 'empty');
        },
        error: (error: Error) => {
          this.positionsError.set(error.message);
          this.positionsState.set('error');
        },
      });
  }

  protected loadStrategies(): void {
    this.strategiesState.set('loading');
    this.strategiesApi
      .list(5, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.strategies.set(value.items);
          this.strategiesState.set(value.items.length ? 'ready' : 'empty');
        },
        error: (error: Error) => {
          this.strategiesError.set(error.message);
          this.strategiesState.set('error');
        },
      });
  }

  protected loadBacktests(): void {
    this.backtestsState.set('loading');
    this.backtestsApi
      .list(5, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.backtests.set(
            value.items.map((item) => ({
              id: item.id,
              strategy_name: item.strategy_name,
              symbol: item.symbol,
              status: item.status,
              created_at: item.created_at,
            })),
          );
          this.backtestsState.set(value.items.length ? 'ready' : 'empty');
        },
        error: (error: Error) => {
          this.backtestsError.set(error.message);
          this.backtestsState.set('error');
        },
      });
  }

  protected loadTrades(): void {
    this.tradesState.set('loading');
    this.trading
      .executions(5, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.trades.set(value.executions);
          this.tradesState.set(value.executions.length ? 'ready' : 'empty');
        },
        error: (error: Error) => {
          this.tradesError.set(error.message);
          this.tradesState.set('error');
        },
      });
  }
}
