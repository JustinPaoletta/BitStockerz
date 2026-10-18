import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { StrategiesApiService } from '../strategies/data/strategies-api.service';
import { MarketPage } from './market.page';
import { PriceChartComponent, type MarketChart } from './price-chart.component';

@Component({ selector: 'app-price-chart', template: '' })
class StubPriceChartComponent {
  readonly data = input.required<MarketChart>();
}

describe('MarketPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MarketPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: StrategiesApiService, useValue: { list: () => of({ items: [] }) } },
      ],
    })
      .overrideComponent(MarketPage, {
        remove: { imports: [PriceChartComponent] },
        add: { imports: [StubPriceChartComponent] },
      })
      .compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('identifies generated prices and the actual bar coverage in the selected range', async () => {
    const fixture = TestBed.createComponent(MarketPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/workspace/watchlist').flush({ symbols: [] });
    http.expectOne((request) => request.url === '/api/workspace/chart').flush(chart('seed'));
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Demo data · Simulated prices');
    expect(text).toContain('does not show historical market prices');
    expect(text).toContain('Showing 2 daily bars');
    expect(text).toContain('Oct 15, 2026');
    expect(text).toContain('Oct 16, 2026');
    expect(text).toContain('Simulated close:');
    expect(text).toContain('201 USD');
    expect(text).toContain('View price and volume data (2 bars)');
    expect(text).not.toContain('RSI uses the left scale');
    expect(fixture.nativeElement.querySelector('a[href="/trade?symbol=AAPL"]')).not.toBeNull();
  });

  it('identifies provider bars without claiming they are live quotes', async () => {
    const fixture = TestBed.createComponent(MarketPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/workspace/watchlist').flush({ symbols: [] });
    http.expectOne((request) => request.url === '/api/workspace/chart').flush(chart('database'));
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Alpaca price data · Not live quotes');
    expect(text).not.toContain('Demo data · Simulated prices');
    expect(text).toContain('Close:');
    expect(text).not.toContain('Simulated close:');
  });

  it('still identifies demo bars after they have been stored in the database', async () => {
    const fixture = TestBed.createComponent(MarketPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/workspace/watchlist').flush({ symbols: [] });
    http
      .expectOne((request) => request.url === '/api/workspace/chart')
      .flush({
        ...chart('database'),
        price_source: 'seed',
        contains_simulated_prices: true,
      });
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Demo data · Simulated prices');
    expect(text).toContain('Simulated close:');
    expect(text).not.toContain('Alpaca price data');
  });
});

function chart(dataMode: MarketChart['data_mode']): MarketChart {
  return {
    symbol: 'AAPL',
    currency: 'USD',
    timeframe: '1d',
    data_mode: dataMode,
    price_source: dataMode === 'seed' ? 'seed' : 'alpaca',
    contains_simulated_prices: dataMode === 'seed',
    bars: [
      {
        timestamp: '2026-10-15T00:00:00.000Z',
        open: '199',
        high: '201',
        low: '198',
        close: '200',
        volume: '1000',
      },
      {
        timestamp: '2026-10-16T00:00:00.000Z',
        open: '200',
        high: '202',
        low: '199',
        close: '201',
        volume: '1100',
      },
    ],
    indicators: [],
  };
}
