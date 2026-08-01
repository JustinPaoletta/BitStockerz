import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { BacktestDetailResponse, BacktestTrade } from '../models/backtest.models';
import { BacktestDetailPage } from './backtest-detail.page';

describe('BacktestDetailPage', () => {
  const runId = '50100000-0000-4000-8000-000000000009';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BacktestDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: runId }) },
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('appends a second trade page without duplicates and stops when no pages remain', async () => {
    const fixture = TestBed.createComponent(BacktestDetailPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    const firstPage = http.expectOne(
      (request) =>
        request.url === `/api/backtests/${runId}` &&
        request.params.get('trades_limit') === '500' &&
        request.params.get('trades_offset') === '0',
    );
    firstPage.flush(
      detailWithTrades(
        Array.from({ length: 500 }, (_, index) => trade(index + 1)),
        true,
      ),
    );
    await fixture.whenStable();
    fixture.detectChanges();

    let element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tbody tr')).toHaveLength(500);
    expect(element.textContent).toContain('500 loaded');

    const loadMore = element.querySelector<HTMLButtonElement>('button.load-more');
    expect(loadMore?.textContent).toContain('Load more trades');
    loadMore?.click();
    fixture.detectChanges();

    const secondPage = http.expectOne(
      (request) =>
        request.url === `/api/backtests/${runId}` &&
        request.params.get('trades_limit') === '500' &&
        request.params.get('trades_offset') === '500',
    );
    secondPage.flush(detailWithTrades([trade(500), trade(501)], false, 500));
    await fixture.whenStable();
    fixture.detectChanges();

    element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('tbody tr')).toHaveLength(501);
    expect(element.textContent).toContain('501 loaded');
    expect(element.querySelector('button.load-more')).toBeNull();
  });
});

function detailWithTrades(
  trades: BacktestTrade[],
  hasMore: boolean,
  offset = 0,
): BacktestDetailResponse {
  const timestamp = '2026-08-01T00:00:00.000Z';
  return {
    run: {
      id: '50100000-0000-4000-8000-000000000009',
      strategy_id: 'strategy-id',
      strategy_version_id: 1,
      symbol: 'AAPL',
      timeframe: '1d',
      start_date: timestamp,
      end_date: timestamp,
      initial_equity: '10000.00',
      status: 'completed',
      created_at: timestamp,
      updated_at: timestamp,
    },
    results: null,
    trades,
    trades_page: { limit: 500, offset, has_more: hasMore },
    equity_curve: [],
  };
}

function trade(id: number): BacktestTrade {
  const timestamp = new Date(Date.UTC(2026, 7, 1, 0, id)).toISOString();
  return {
    id,
    symbol_id: 1,
    entry_time: timestamp,
    exit_time: timestamp,
    side: 'long',
    entry_price: '100.00000000',
    exit_price: '101.00000000',
    quantity: '1.00000000',
    pnl_abs: '1.00000000',
    pnl_pct: '1.0000',
  };
}
