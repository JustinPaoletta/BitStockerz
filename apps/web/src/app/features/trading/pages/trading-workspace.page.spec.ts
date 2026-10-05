import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { TradingApiService } from '../data/trading-api.service';
import { TradingWorkspacePage } from './trading-workspace.page';

describe('TradingWorkspacePage symbol navigation', () => {
  it('prefills and updates the symbol without submitting an order or changing quantity', async () => {
    const params = new BehaviorSubject(convertToParamMap({ symbol: ' btc-usd ' }));
    const placeOrder = vi.fn();
    await TestBed.configureTestingModule({
      imports: [TradingWorkspacePage],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: params } },
        {
          provide: TradingApiService,
          useValue: {
            portfolioSummary: () =>
              of({
                cash_balance: '100000',
                total_equity: '100000',
                unrealized_pnl_total: '0',
                realized_pnl_total: '25.50',
                total_pnl: '25.50',
                total_position_value: '0',
              }),
            positions: () => of({ positions: [] }),
            orders: () => of({ orders: [], has_more: false }),
            executions: () => of({ executions: [], has_more: false }),
            latestClose: () => of({ price: '100', as_of: '2026-10-03T00:00:00Z', interval: '1d' }),
            placeOrder,
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TradingWorkspacePage);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Realized P&L');
    expect(element.textContent).toContain('$25.50');
    expect(element.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe('BTC-USD');
    const quantity = element.querySelector<HTMLInputElement>('#qty')!;
    quantity.value = '2.5';
    quantity.dispatchEvent(new Event('input'));
    params.next(convertToParamMap({ symbol: ' aapl ' }));
    fixture.detectChanges();
    expect(element.querySelector<HTMLInputElement>('[role="combobox"]')?.value).toBe('AAPL');
    expect(quantity.value).toBe('2.5');
    expect(placeOrder).not.toHaveBeenCalled();
  });
});
