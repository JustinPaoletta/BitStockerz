import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BsCurrencyPipe, BsDateTimePipe } from '../../../shared/format/display.pipes';
import { SymbolSearchComponent } from '../../../shared/symbols/symbol-search.component';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { InlineErrorComponent } from '../../../shared/ui/inline-error.component';
import { SkeletonComponent } from '../../../shared/ui/skeleton.component';
import {
  ExecutionRow,
  OrderRow,
  PortfolioSummary,
  PositionRow,
  TradingApiService,
} from '../data/trading-api.service';

@Component({
  selector: 'app-trading-workspace-page',
  imports: [
    ReactiveFormsModule,
    SymbolSearchComponent,
    SkeletonComponent,
    InlineErrorComponent,
    EmptyStateComponent,
    BsCurrencyPipe,
    BsDateTimePipe,
  ],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Paper trading</p>
        <h1>Trade desk</h1>
        <p class="lede">Market orders fill at the latest eligible close. Quantity must be a decimal string.</p>
      </div>
    </section>

    <div class="trade-grid">
      <section class="panel block">
        <h2>Account</h2>
        @if (summaryLoading()) {
          <app-skeleton />
        } @else if (summaryError()) {
          <app-inline-error [message]="summaryError()" (retry)="refreshSummary()" />
        } @else if (summary(); as account) {
          <div class="metric-grid compact">
            <article><span>Cash</span><strong>{{ account.cash_balance | bsCurrency }}</strong></article>
            <article><span>Equity</span><strong>{{ account.total_equity | bsCurrency }}</strong></article>
            <article>
              <span>Unrealized</span><strong>{{ account.unrealized_pnl_total | bsCurrency }}</strong>
            </article>
          </div>
        }
      </section>

      <section class="panel block">
        <h2>Order ticket</h2>
        <form [formGroup]="ticket" (ngSubmit)="submit()">
          <app-symbol-search formControlName="symbol" />
          <label for="side">Side</label>
          <select id="side" formControlName="side">
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
          </select>
          <label for="qty">Quantity</label>
          <input id="qty" formControlName="quantity" placeholder="2.5" />
          @if (orderError()) {
            <p class="error" role="alert">{{ orderError() }}</p>
          }
          @if (orderResult()) {
            <p class="hint" role="status">{{ orderResult() }}</p>
          }
          <div class="actions">
            <button class="button primary" type="submit" [disabled]="ticket.invalid || orderBusy()">
              {{ orderBusy() ? 'Submitting…' : 'Submit market order' }}
            </button>
          </div>
        </form>
      </section>

      <section class="panel block">
        <h2>Positions</h2>
        @if (positionsLoading()) {
          <app-skeleton />
        } @else if (positionsError()) {
          <app-inline-error [message]="positionsError()" (retry)="refreshPositions()" />
        } @else if (!positions().length) {
          <app-empty-state title="No open positions" message="Filled BUY orders appear here." />
        } @else {
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
      </section>

      <section class="panel block">
        <h2>Recent orders</h2>
        @if (ordersLoading()) {
          <app-skeleton />
        } @else if (ordersError()) {
          <app-inline-error [message]="ordersError()" (retry)="refreshOrders()" />
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Reason / fill</th>
                </tr>
              </thead>
              <tbody>
                @for (row of orders(); track row.id) {
                  <tr>
                    <td>{{ row.status }}</td>
                    <td>{{ row.symbol }}</td>
                    <td>{{ row.side }}</td>
                    <td>{{ row.quantity }}</td>
                    <td>{{ row.reject_reason || row.avg_fill_price || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (ordersHasMore()) {
            <button class="button ghost small" type="button" (click)="loadMoreOrders()">Load more</button>
          }
        }
      </section>

      <section class="panel block wide">
        <h2>Executions</h2>
        @if (executionsLoading()) {
          <app-skeleton />
        } @else if (executionsError()) {
          <app-inline-error [message]="executionsError()" (retry)="refreshExecutions()" />
        } @else if (!executions().length) {
          <app-empty-state title="No trades yet" message="Filled executions will list here." />
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Notional</th>
                </tr>
              </thead>
              <tbody>
                @for (row of executions(); track $index) {
                  <tr>
                    <td>{{ row.executed_at | bsDateTime }}</td>
                    <td>{{ row.symbol }}</td>
                    <td>{{ row.side }}</td>
                    <td>{{ row.quantity }}</td>
                    <td>{{ row.price }}</td>
                    <td>{{ row.notional | bsCurrency }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (executionsHasMore()) {
            <button class="button ghost small" type="button" (click)="loadMoreExecutions()">
              Load more
            </button>
          }
        }
      </section>
    </div>
  `,
  styles: `
    .trade-grid {
      display: grid;
      gap: 1.25rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .block {
      padding: 1.25rem;
    }
    .wide {
      grid-column: 1 / -1;
    }
    .metric-grid.compact {
      grid-template-columns: repeat(3, 1fr);
      margin: 0;
    }
    form {
      display: grid;
      gap: 0.85rem;
    }
    @media (max-width: 900px) {
      .trade-grid {
        grid-template-columns: 1fr;
      }
      .wide {
        grid-column: auto;
      }
    }
  `,
})
export class TradingWorkspacePage implements OnInit {
  protected readonly ticket = new FormGroup({
    symbol: new FormControl('AAPL', { nonNullable: true, validators: [Validators.required] }),
    side: new FormControl<'BUY' | 'SELL'>('BUY', { nonNullable: true }),
    quantity: new FormControl('1', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)],
    }),
  });

  protected readonly summary = signal<PortfolioSummary | null>(null);
  protected readonly summaryLoading = signal(true);
  protected readonly summaryError = signal('');
  protected readonly positions = signal<PositionRow[]>([]);
  protected readonly positionsLoading = signal(true);
  protected readonly positionsError = signal('');
  protected readonly orders = signal<OrderRow[]>([]);
  protected readonly ordersLoading = signal(true);
  protected readonly ordersError = signal('');
  protected readonly ordersHasMore = signal(false);
  protected readonly executions = signal<ExecutionRow[]>([]);
  protected readonly executionsLoading = signal(true);
  protected readonly executionsError = signal('');
  protected readonly executionsHasMore = signal(false);
  protected readonly orderBusy = signal(false);
  protected readonly orderError = signal('');
  protected readonly orderResult = signal('');

  private clientOrderId = crypto.randomUUID();
  private ordersOffset = 0;
  private executionsOffset = 0;
  private readonly api = inject(TradingApiService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.ticket.valueChanges.subscribe(() => {
      this.clientOrderId = crypto.randomUUID();
    });
    this.refreshAll();
  }

  protected refreshAll(): void {
    this.refreshSummary();
    this.refreshPositions();
    this.refreshOrders(true);
    this.refreshExecutions(true);
  }

  protected refreshSummary(): void {
    this.summaryLoading.set(true);
    this.summaryError.set('');
    this.api
      .portfolioSummary()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.summary.set(value);
          this.summaryLoading.set(false);
        },
        error: (error: Error) => {
          this.summaryError.set(error.message);
          this.summaryLoading.set(false);
        },
      });
  }

  protected refreshPositions(): void {
    this.positionsLoading.set(true);
    this.positionsError.set('');
    this.api
      .positions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.positions.set(value.positions);
          this.positionsLoading.set(false);
        },
        error: (error: Error) => {
          this.positionsError.set(error.message);
          this.positionsLoading.set(false);
        },
      });
  }

  protected refreshOrders(reset = false): void {
    if (reset) {
      this.ordersOffset = 0;
      this.orders.set([]);
    }
    this.ordersLoading.set(true);
    this.ordersError.set('');
    this.api
      .orders(10, this.ordersOffset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.orders.update((current) =>
            reset ? value.orders : [...current, ...value.orders],
          );
          this.ordersHasMore.set(value.has_more);
          this.ordersLoading.set(false);
        },
        error: (error: Error) => {
          this.ordersError.set(error.message);
          this.ordersLoading.set(false);
        },
      });
  }

  protected refreshExecutions(reset = false): void {
    if (reset) {
      this.executionsOffset = 0;
      this.executions.set([]);
    }
    this.executionsLoading.set(true);
    this.executionsError.set('');
    this.api
      .executions(10, this.executionsOffset)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (value) => {
          this.executions.update((current) =>
            reset ? value.executions : [...current, ...value.executions],
          );
          this.executionsHasMore.set(value.has_more);
          this.executionsLoading.set(false);
        },
        error: (error: Error) => {
          this.executionsError.set(error.message);
          this.executionsLoading.set(false);
        },
      });
  }

  protected loadMoreOrders(): void {
    this.ordersOffset += 10;
    this.refreshOrders(false);
  }

  protected loadMoreExecutions(): void {
    this.executionsOffset += 10;
    this.refreshExecutions(false);
  }

  protected async submit(): Promise<void> {
    if (this.ticket.invalid || this.orderBusy()) return;
    const values = this.ticket.getRawValue();
    if (values.side === 'SELL') {
      const held = this.positions().find((row) => row.symbol === values.symbol);
      if (!held || Number(values.quantity) > Number(held.quantity)) {
        this.orderError.set('SELL quantity cannot exceed the currently displayed position.');
        return;
      }
    }

    this.orderBusy.set(true);
    this.orderError.set('');
    this.orderResult.set('');
    const attemptId = this.clientOrderId;
    try {
      const response = await firstValueFrom(
        this.api.placeOrder({
          symbol: values.symbol,
          side: values.side,
          quantity: values.quantity,
          client_order_id: attemptId,
        }),
      );
      const order = response.order;
      if (order.status === 'FILLED') {
        this.orderResult.set(
          `Filled ${order.side} ${order.quantity} ${order.symbol} @ ${order.avg_fill_price ?? 'n/a'}`,
        );
      } else if (order.status === 'REJECTED') {
        this.orderResult.set(`Rejected: ${order.reject_reason ?? 'business rule'}`);
      } else {
        this.orderResult.set(`Order status: ${order.status}`);
      }
      this.clientOrderId = crypto.randomUUID();
      this.refreshSummary();
      this.refreshPositions();
      this.refreshOrders(true);
      this.refreshExecutions(true);
    } catch (error) {
      this.orderError.set(error instanceof Error ? error.message : 'Order failed.');
    } finally {
      this.orderBusy.set(false);
    }
  }
}
