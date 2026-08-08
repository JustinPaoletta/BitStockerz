import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { BsCurrencyPipe, BsSignedPipe } from '../../shared/format/display.pipes';
import { BsCardComponent } from '../../shared/ui/bs-card.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { InlineErrorComponent } from '../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { SymbolSearchComponent } from '../../shared/symbols/symbol-search.component';
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
    EmptyStateComponent,
    SymbolSearchComponent,
    BsCurrencyPipe,
    BsSignedPipe,
  ],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h1>Your trading workspace</h1>
        <p class="lede">Independent widgets load in parallel so one failure never blanks the page.</p>
      </div>
    </section>

    <div class="dashboard-grid">
      <app-bs-card eyebrow="Account" title="Portfolio summary">
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
                    {{ summary.unrealized_pnl_total | bsSigned | bsCurrency }}
                    <span class="sr-only">
                      {{
                        signedNumber(summary.unrealized_pnl_total) >= 0 ? 'gain' : 'loss'
                      }}
                    </span>
                  </strong>
                </article>
              </div>
            }
          }
        }
      </app-bs-card>

      <app-bs-card eyebrow="Book" title="Positions">
        <a cardActions class="text-link" routerLink="/trade">Open trade desk</a>
        @switch (positionsState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="positionsError()" (retry)="loadPositions()" />
          }
          @case ('empty') {
            <app-empty-state
              title="No open positions"
              message="Place a market order to build your paper book."
              ctaLabel="Trade"
              ctaLink="/trade"
            />
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
                      <td>{{ row.quantity }}</td>
                      <td>{{ row.avg_cost }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </app-bs-card>

      <app-bs-card eyebrow="Lab" title="Strategies">
        <a cardActions class="text-link" routerLink="/strategies">View all</a>
        @switch (strategiesState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="strategiesError()" (retry)="loadStrategies()" />
          }
          @case ('empty') {
            <app-empty-state
              title="Create your first strategy"
              message="Build a rule-based strategy to run backtests."
              ctaLabel="Strategies"
              ctaLink="/strategies"
            />
          }
          @case ('ready') {
            <ul class="link-list">
              @for (item of strategies(); track item.id) {
                <li>
                  <a [routerLink]="['/strategies', item.id]">{{ item.name }}</a>
                  <div class="row-actions">
                    <a class="text-link" [routerLink]="['/strategies', item.id]">Edit</a>
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

      <app-bs-card eyebrow="Research" title="Recent backtests">
        @switch (backtestsState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="backtestsError()" (retry)="loadBacktests()" />
          }
          @case ('empty') {
            <app-empty-state
              title="Run a backtest"
              message="Launch a strategy against historical bars."
              ctaLabel="Backtests"
              ctaLink="/backtests"
            />
          }
          @case ('ready') {
            <ul class="link-list">
              @for (item of backtests(); track item.id) {
                <li>
                  <a [routerLink]="['/backtests', item.id]"
                    >{{ item.strategy_name }} · {{ item.symbol }}</a
                  >
                  <span class="meta">{{ item.status }} · {{ item.created_at }}</span>
                </li>
              }
            </ul>
          }
        }
      </app-bs-card>

      <app-bs-card eyebrow="Activity" title="Recent trades">
        @switch (tradesState()) {
          @case ('loading') {
            <app-skeleton />
          }
          @case ('error') {
            <app-inline-error [message]="tradesError()" (retry)="loadTrades()" />
          }
          @case ('empty') {
            <app-empty-state
              title="No trades yet"
              message="Filled paper executions will show up here."
              ctaLabel="Trade"
              ctaLink="/trade"
            />
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
                      <td>{{ row.executed_at }}</td>
                      <td>{{ row.symbol }}</td>
                      <td>{{ row.side }}</td>
                      <td>{{ row.quantity }}</td>
                      <td>{{ row.price }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </app-bs-card>

      <app-bs-card eyebrow="Lookup" title="Symbol search">
        <app-symbol-search />
      </app-bs-card>
    </div>
  `,
  styles: `
    .dashboard-grid {
      display: grid;
      gap: 1.25rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .metric-grid.compact {
      grid-template-columns: repeat(3, 1fr);
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
      gap: 0.85rem;
    }
    .sr-only {
      clip: rect(0 0 0 0);
      height: 1px;
      overflow: hidden;
      position: absolute;
      width: 1px;
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

  private readonly trading = inject(TradingApiService);
  private readonly strategiesApi = inject(StrategiesApiService);
  private readonly backtestsApi = inject(BacktestsApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.loadAccount();
    this.loadPositions();
    this.loadStrategies();
    this.loadBacktests();
    this.loadTrades();
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
