import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SymbolSearchComponent } from '../../shared/symbols/symbol-search.component';
import {
  StrategiesApiService,
  type StrategySummary,
} from '../strategies/data/strategies-api.service';
import { PriceChartComponent, type MarketChart } from './price-chart.component';

@Component({
  selector: 'app-market-page',
  imports: [FormsModule, DatePipe, RouterLink, SymbolSearchComponent, PriceChartComponent],
  template: `
    <section class="page-heading">
      <div>
        <p class="eyebrow">Market research</p>
        <h1>Charts and watchlist</h1>
        <p class="lede">Inspect historical prices and the indicators your strategy follows.</p>
      </div>
    </section>
    <section class="panel controls">
      <app-symbol-search [(ngModel)]="symbol" inputId="market-symbol" />
      <label
        >Timeframe
        <select [(ngModel)]="timeframe" (ngModelChange)="changeTimeframe()">
          <option value="1d">Daily</option>
          <option value="1h">Hourly (crypto)</option>
        </select></label
      >
      <label>Start UTC <input type="date" [(ngModel)]="start" /></label
      ><label>End UTC <input type="date" [(ngModel)]="end" /></label>
      <label
        >Indicator overlay
        <select [(ngModel)]="strategy">
          <option value="">Price only</option>
          @for (item of strategies(); track item.id) {
            <option [value]="item.id">
              {{ item.name }} · {{ item.asset_type }} {{ item.timeframe }}
            </option>
          }
        </select></label
      >
      <button type="button" class="button primary" [disabled]="busy()" (click)="loadChart()">
        {{ busy() ? 'Loading…' : 'Load chart' }}</button
      ><button type="button" class="button secondary" (click)="saveSymbol()" [disabled]="busy()">
        Save symbol
      </button>
    </section>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <section class="panel watchlist">
      <h2>Your watchlist</h2>
      @for (item of watchlist(); track item.symbol) {
        <span
          ><button
            type="button"
            class="button secondary"
            (click)="choose(item.symbol, item.asset_type)"
          >
            {{ item.symbol }}</button
          ><button
            type="button"
            class="button ghost"
            [attr.aria-label]="'Remove ' + item.symbol"
            (click)="removeSymbol(item.symbol)"
          >
            ×
          </button></span
        >
      } @empty {
        <p>Save a symbol to return to it quickly.</p>
      }
    </section>
    @if (chart(); as data) {
      <section class="panel chart-panel">
        <h2>{{ data.symbol }} · {{ data.timeframe }}</h2>
        @if (data.data_mode === 'seed') {
          <p class="hint">Development seed data — simulated prices.</p>
        }
        @if (data.bars.length) {
          <p>
            Last chart bar:
            {{ data.bars[data.bars.length - 1].timestamp | date: 'medium' : 'UTC' }} UTC · Close
            {{ data.bars[data.bars.length - 1].close }}
          </p>
          <p class="hint">
            Historical bar closes are not live quotes. RSI uses the left scale; price and moving
            averages use the right scale.
          </p>
          <app-price-chart [data]="data" />
          <details>
            <summary>Accessible OHLCV data (latest 50 bars)</summary>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>UTC</th>
                    <th>Open</th>
                    <th>High</th>
                    <th>Low</th>
                    <th>Close</th>
                    <th>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  @for (bar of data.bars.slice(-50); track bar.timestamp) {
                    <tr>
                      <td>{{ bar.timestamp }}</td>
                      <td>{{ bar.open }}</td>
                      <td>{{ bar.high }}</td>
                      <td>{{ bar.low }}</td>
                      <td>{{ bar.close }}</td>
                      <td>{{ bar.volume }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </details>
        } @else {
          <p>No bars for this range. Choose a period covered by your data source.</p>
        }
        <a class="button secondary" routerLink="/trade" [queryParams]="{ symbol: symbol }"
          >Open Trade desk</a
        >
      </section>
    }
  `,
  styles: `
    .panel {
      padding: 1.5rem;
      margin-bottom: 1rem;
    }
    .controls {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      align-items: end;
    }
    label {
      display: grid;
      gap: 0.5rem;
      min-width: 140px;
    }
    .watchlist span {
      display: inline-flex;
      margin: 0.3rem;
    }
    .table-wrap {
      overflow: auto;
    }
  `,
})
export class MarketPage {
  private readonly http = inject(HttpClient);
  private readonly api = inject(StrategiesApiService);
  readonly chart = signal<MarketChart | null>(null);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly watchlist = signal<{ symbol: string; asset_type: string }[]>([]);
  readonly strategies = signal<StrategySummary[]>([]);
  symbol = inject(ActivatedRoute).snapshot.queryParamMap.get('symbol') ?? 'AAPL';
  timeframe: '1d' | '1h' = '1d';
  strategy = '';
  end = new Date().toISOString().slice(0, 10);
  start = new Date(Date.now() - 86400000 * 365).toISOString().slice(0, 10);
  constructor() {
    void this.loadLists();
  }
  private async loadLists(): Promise<void> {
    try {
      const [list, strategies] = await Promise.all([
        firstValueFrom(
          this.http.get<{ symbols: { symbol: string; asset_type: string }[] }>(
            '/api/workspace/watchlist',
          ),
        ),
        firstValueFrom(this.api.list()),
      ]);
      this.watchlist.set(list.symbols);
      this.strategies.set(strategies.items);
    } catch {
      this.error.set('Unable to load watchlist or strategies.');
    }
  }
  async loadChart(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.chart.set(null);
    try {
      this.chart.set(
        await firstValueFrom(
          this.http.get<MarketChart>('/api/workspace/chart', {
            params: {
              symbol: this.symbol,
              timeframe: this.timeframe,
              start: this.start,
              end: this.end,
              ...(this.strategy ? { strategy_id: this.strategy } : {}),
            },
          }),
        ),
      );
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse
          ? (error.error?.detail ?? 'Unable to load chart.')
          : 'Unable to load chart.',
      );
    } finally {
      this.busy.set(false);
    }
  }
  changeTimeframe(): void {
    this.strategy = '';
    if (this.timeframe === '1h' && Date.parse(this.end) - Date.parse(this.start) > 90 * 86400000)
      this.start = new Date(Date.parse(this.end) - 90 * 86400000).toISOString().slice(0, 10);
  }
  choose(symbol: string, asset: string): void {
    this.symbol = symbol;
    if (asset === 'EQUITY') this.timeframe = '1d';
    void this.loadChart();
  }
  async saveSymbol(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/workspace/watchlist', { symbol: this.symbol }));
      await this.loadLists();
    } catch {
      this.error.set('Unable to save symbol.');
    }
  }
  async removeSymbol(symbol: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete('/api/workspace/watchlist/' + encodeURIComponent(symbol)),
      );
      await this.loadLists();
    } catch {
      this.error.set('Unable to remove symbol.');
    }
  }
}
