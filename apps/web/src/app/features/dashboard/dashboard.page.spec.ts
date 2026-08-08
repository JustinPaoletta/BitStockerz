import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
});
