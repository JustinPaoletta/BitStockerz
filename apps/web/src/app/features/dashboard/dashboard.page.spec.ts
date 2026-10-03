import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { SymbolSearchComponent } from '../../shared/symbols/symbol-search.component';
import { of, throwError } from 'rxjs';
import { BacktestsApiService } from '../backtests/backtests-api.service';
import { StrategiesApiService } from '../strategies/data/strategies-api.service';
import { TradingApiService } from '../trading/data/trading-api.service';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: TradingApiService,
          useValue: {
            portfolioSummary: () => throwError(() => new Error('portfolio down')),
            positions: () =>
              of({
                positions: [{ symbol: 'AAPL', quantity: '1.00000000', avg_cost: '200.00000000' }],
              }),
            executions: () => of({ executions: [], limit: 5, offset: 0, has_more: false }),
          },
        },
        {
          provide: StrategiesApiService,
          useValue: {
            list: () => of({ items: [], limit: 5, offset: 0, has_more: false }),
          },
        },
        {
          provide: BacktestsApiService,
          useValue: {
            list: () => of({ items: [], limit: 5, offset: 0, has_more: false }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('keeps other widgets ready when portfolio summary fails', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('portfolio down');
    expect(text).toContain('AAPL');
    expect(text).toContain('No trades yet');
  });

  it('opens the trade ticket with the selected dashboard symbol', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const search = fixture.debugElement.query(By.directive(SymbolSearchComponent))
      .componentInstance as SymbolSearchComponent;
    search.selected.emit({ symbol: 'BTC-USD', asset_type: 'CRYPTO' });
    expect(navigate).toHaveBeenCalledWith(['/trade'], {
      queryParams: { symbol: 'BTC-USD' },
    });
  });

  it('recovers only the failed widget when retrying the portfolio', async () => {
    const portfolio = vi.spyOn(TestBed.inject(TradingApiService), 'portfolioSummary');
    portfolio.mockReturnValue(
      of({
        cash_balance: '100000.00',
        total_equity: '100000.00',
        total_position_value: '0.00',
        unrealized_pnl_total: '0.00',
        realized_pnl_total: '-12.50',
        total_pnl: '-12.50',
      }),
    );
    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    retry.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('$100,000.00');
    expect(fixture.nativeElement.textContent).toContain('Realized P&L');
    expect(fixture.nativeElement.textContent).toContain('-$12.50');
    expect(fixture.nativeElement.textContent).not.toContain('portfolio down');
    expect(fixture.nativeElement.textContent).toContain('AAPL');
  });
});
