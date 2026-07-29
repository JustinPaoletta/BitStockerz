import { Component, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { BacktestTrade } from '../models/backtest.models';

@Component({
  selector: 'app-trades-table',
  imports: [DatePipe, DecimalPipe],
  template: `
    @if (trades().length === 0) {
      <p class="empty">No trades were generated for this run.</p>
    } @else {
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Entry</th>
              <th scope="col">Exit</th>
              <th scope="col">Entry price</th>
              <th scope="col">Exit price</th>
              <th scope="col">Quantity</th>
              <th scope="col">P&amp;L</th>
              <th scope="col">Return</th>
            </tr>
          </thead>
          <tbody>
            @for (trade of trades(); track trade.id) {
              <tr>
                <td>{{ trade.entry_time | date: 'medium' }}</td>
                <td>{{ trade.exit_time | date: 'medium' }}</td>
                <td>{{ number(trade.entry_price) | number: '1.2-8' }}</td>
                <td>{{ number(trade.exit_price) | number: '1.2-8' }}</td>
                <td>{{ number(trade.quantity) | number: '1.2-8' }}</td>
                <td
                  [class.positive]="number(trade.pnl_abs) > 0"
                  [class.negative]="number(trade.pnl_abs) < 0"
                >
                  {{ number(trade.pnl_abs) | number: '1.2-2' }}
                </td>
                <td
                  [class.positive]="number(trade.pnl_pct) > 0"
                  [class.negative]="number(trade.pnl_pct) < 0"
                >
                  {{ number(trade.pnl_pct) | number: '1.2-2' }}%
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class TradesTableComponent {
  readonly trades = input.required<BacktestTrade[]>();
  protected number(value: string): number {
    return Number(value);
  }
}
