import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SymbolSearchComponent } from '../../shared/symbols/symbol-search.component';
import { StrategiesApiService } from '../strategies/data/strategies-api.service';
interface Runner {
  id: string;
  strategy_id: string;
  strategy_version_id: number;
  symbol_id: number;
  symbol: string;
  timeframe: string;
  status: string;
  allocation_pct: string;
  state: {
    quantity: string;
    entry_price: string;
    realized_pnl: string;
    closed_trades: number;
    last_bar?: string;
    activity: { at: string; event: string; bar?: string; order_id?: string; reason?: string }[];
  };
}
@Component({
  selector: 'app-automation-page',
  imports: [FormsModule, RouterLink, SymbolSearchComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Forward testing</p>
        <h1>Paper strategy runners</h1>
        <p class="lede">Run a pinned strategy version against completed bars, using paper money.</p>
      </div>
      <a routerLink="/trade" class="text-link">Trade desk</a>
    </section>
    <section class="panel block">
      <p>
        Runners evaluate the newest available completed bar, once per bar. Orders use the latest
        close and account risk limits. Stop loss and take profit are checked at the close, so
        intrabar exits can differ from backtests. No missed-bar replay or guaranteed execution.
      </p>
      <p>
        Scheduling needs a running API, database, and fresh vendor ingestion. Stale data or changed
        manual positions pause the runner for review. Keep manual trading in other symbols.
      </p>
      <form (ngSubmit)="create()">
        <label for="runner-strategy">Saved strategy</label
        ><select id="runner-strategy" name="strategy" [(ngModel)]="strategy">
          <option value="">Choose a strategy</option>
          @for (item of strategies(); track item.id) {
            <option [value]="item.id">{{ item.name }} · {{ item.timeframe }}</option>
          }</select
        ><app-symbol-search name="symbol" [(ngModel)]="symbol" /><label for="runner-allocation"
          >Available cash allocation %</label
        ><input
          id="runner-allocation"
          name="allocation"
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          [(ngModel)]="allocation"
        /><button class="button primary" [disabled]="busy() || !strategy || !symbol">
          Create paused runner
        </button>
      </form>
    </section>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @for (runner of runners(); track runner.id) {
      <section class="panel block">
        <h2>{{ name(runner.strategy_id) }} · pinned strategy</h2>
        <p>
          {{ runner.status }} · {{ runner.symbol }} · {{ runner.timeframe }} ·
          {{ runner.allocation_pct }}% cash allocation
        </p>
        <p>
          Held quantity: {{ runner.state.quantity }} · entry: {{ runner.state.entry_price }} ·
          realized paper P&amp;L: {{ runner.state.realized_pnl }} USD · closed trades:
          {{ runner.state.closed_trades }}
        </p>
        <p>Last evaluated bar: {{ runner.state.last_bar || 'None' }}</p>
        <div class="actions">
          @if (runner.status !== 'stopped') {
            <button
              class="button ghost"
              [disabled]="busy()"
              (click)="control(runner, runner.status === 'active' ? 'paused' : 'active')"
            >
              {{ runner.status === 'active' ? 'Pause' : 'Resume' }}</button
            ><button
              class="button ghost"
              [disabled]="busy() || runner.status !== 'active'"
              (click)="evaluate(runner)"
            >
              Evaluate latest bar</button
            ><button class="button ghost" [disabled]="busy()" (click)="control(runner, 'stopped')">
              Stop and archive
            </button>
          }
        </div>
        <p class="hint">
          Pausing keeps positions open. Stopping requires no open runner position. Account reset
          archives the ledger and stops all runners.
        </p>
        <details>
          <summary>Activity (latest 100)</summary>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>UTC time</th>
                  <th>Event</th>
                  <th>Bar</th>
                  <th>Order / reason</th>
                </tr>
              </thead>
              <tbody>
                @for (event of runner.state.activity.slice().reverse(); track $index) {
                  <tr>
                    <td>{{ event.at }}</td>
                    <td>{{ event.event }}</td>
                    <td>{{ event.bar || '—' }}</td>
                    <td>{{ event.reason || event.order_id || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </details>
      </section>
    } @empty {
      <p>
        No runners yet. Create a strategy in <a routerLink="/strategies/new">Strategy Lab</a> to
        begin.
      </p>
    }
  `,
  styles: `
    .block {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    form {
      display: grid;
      gap: 0.8rem;
      max-width: 38rem;
    }
  `,
})
export class AutomationPage {
  private readonly http = inject(HttpClient);
  private readonly api = inject(StrategiesApiService);
  protected readonly runners = signal<Runner[]>([]);
  protected readonly strategies = signal<{ id: string; name: string; timeframe: string }[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected strategy = '';
  protected symbol = 'AAPL';
  protected allocation = 10;
  constructor() {
    void this.load();
  }
  protected name(id: string) {
    return this.strategies().find((item) => item.id === id)?.name ?? id;
  }
  private async load() {
    try {
      const [rows, strategies] = await Promise.all([
        firstValueFrom(this.http.get<{ automations: Runner[] }>('/api/automations')),
        firstValueFrom(this.api.list(100, 0)),
      ]);
      this.runners.set(rows.automations);
      this.strategies.set(strategies.items);
    } catch (error) {
      this.fail(error);
    }
  }
  protected async create() {
    await this.action(() =>
      firstValueFrom(
        this.http.post('/api/automations', {
          strategy_id: this.strategy,
          symbol: this.symbol,
          allocation_pct: this.allocation,
        }),
      ),
    );
  }
  protected async control(runner: Runner, status: string) {
    await this.action(() =>
      firstValueFrom(this.http.post(`/api/automations/${runner.id}/control`, { status })),
    );
  }
  protected async evaluate(runner: Runner) {
    await this.action(() =>
      firstValueFrom(this.http.post(`/api/automations/${runner.id}/evaluate`, {})),
    );
  }
  private async action(fn: () => Promise<unknown>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await fn();
      await this.load();
    } catch (error) {
      this.fail(error);
    } finally {
      this.busy.set(false);
    }
  }
  private fail(error: unknown) {
    this.error.set(
      error instanceof HttpErrorResponse
        ? (error.error?.detail ?? 'Request failed.')
        : error instanceof Error
          ? error.message
          : 'Request failed.',
    );
  }
}
