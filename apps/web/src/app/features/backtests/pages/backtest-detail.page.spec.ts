import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { BacktestDetailResponse, BacktestTrade } from '../models/backtest.models';
import { EquityCurveChartComponent } from '../components/equity-curve-chart.component';
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

  it('keeps loaded details visible after a trade-page failure and retries the same offset', async () => {
    const fixture = TestBed.createComponent(BacktestDetailPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url === `/api/backtests/${runId}`)
      .flush(detailWithTrades([trade(1)], true));
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('button.load-more')!.click();
    http
      .expectOne(
        (request) =>
          request.url === `/api/backtests/${runId}` && request.params.get('trades_offset') === '1',
      )
      .flush(
        { detail: 'Temporary connection failure.' },
        { status: 503, statusText: 'Unavailable' },
      );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('h1')?.textContent).toContain('AAPL');
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.textContent).toContain('1 loaded');
    expect(element.querySelector('app-inline-error')?.textContent).toContain(
      'Temporary connection failure.',
    );
    const retry = element.querySelector<HTMLButtonElement>('app-inline-error button');
    expect(retry?.textContent).toContain('Retry');
    retry!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-inline-error')).toBeNull();
    expect(element.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(element.querySelector<HTMLButtonElement>('button.load-more')?.disabled).toBe(true);

    http
      .expectOne(
        (request) =>
          request.url === `/api/backtests/${runId}` && request.params.get('trades_offset') === '1',
      )
      .flush(detailWithTrades([trade(2)], false, 1));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element.textContent).toContain('2 loaded');
    expect(element.querySelector('app-inline-error')).toBeNull();
    expect(element.querySelector('button.load-more')).toBeNull();
  });

  it('labels partial marker coverage and passes newly loaded trades to the chart', async () => {
    const fixture = TestBed.createComponent(BacktestDetailPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    const first = detailWithTrades([trade(1)], true);
    first.results = {
      final_equity: '10002.00',
      total_return_pct: '0.0200',
      max_drawdown_pct: '0',
      win_rate_pct: '100',
      num_trades: 2,
      avg_win_pct: '1',
      avg_loss_pct: '0',
      sharpe_ratio: null,
    };
    http.expectOne((request) => request.url === `/api/backtests/${runId}`).flush(first);
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const chart = fixture.debugElement.query(By.directive(EquityCurveChartComponent))
      .componentInstance as EquityCurveChartComponent;
    expect(chart.trades()).toHaveLength(1);
    expect(element.querySelector('th')?.textContent).toContain('Entry (UTC)');
    expect(element.querySelector('tbody td')?.textContent).toContain('Aug 1, 2026');
    expect(element.querySelector('.marker-note')?.textContent).toContain('1 of 2 trades');
    element.querySelector<HTMLButtonElement>('button.load-more')!.click();
    http
      .expectOne(
        (request) =>
          request.url === `/api/backtests/${runId}` && request.params.get('trades_offset') === '1',
      )
      .flush(detailWithTrades([trade(2)], false, 1));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(chart.trades()).toHaveLength(2);
    expect(element.querySelector('.marker-note')).toBeNull();
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
