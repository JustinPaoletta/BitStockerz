import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { BacktestListItem } from '../models/backtest.models';
import { BacktestListPage } from './backtest-list.page';

describe('BacktestListPage', () => {
  let fixture: ComponentFixture<BacktestListPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BacktestListPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(BacktestListPage);
    http = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function requestPage(offset: number) {
    return http.expectOne(
      (request) =>
        request.url === '/api/backtests' &&
        request.params.get('limit') === '50' &&
        request.params.get('offset') === String(offset),
    );
  }

  function button(label: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label,
    )!;
  }

  function respond(offset: number, items: BacktestListItem[], hasMore: boolean): void {
    requestPage(offset).flush({ items, offset, limit: 50, has_more: hasMore });
    fixture.detectChanges();
  }

  it('replaces cards when paging, honors has_more, and returns to the first page', () => {
    respond(0, [backtest('first')], true);
    expect(button('Previous').disabled).toBe(true);
    button('Next').click();
    fixture.detectChanges();
    expect(button('Next').disabled).toBe(true);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Loading page 2');
    respond(50, [backtest('second')], false);

    expect(element.querySelector('.run-grid')?.textContent).toContain('Strategy second');
    expect(element.querySelector('.run-grid')?.textContent).not.toContain('Strategy first');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 2');
    expect(button('Next').disabled).toBe(true);
    expect(button('Previous').disabled).toBe(false);

    button('Previous').click();
    respond(0, [backtest('first')], true);
    expect(button('Previous').disabled).toBe(true);
    expect(button('Next').disabled).toBe(false);
  });

  it('keeps the last successful cards after an error and retries the failed page', () => {
    respond(0, [backtest('first')], true);
    button('Next').click();
    requestPage(50).flush(
      { detail: 'Service unavailable' },
      { status: 503, statusText: 'Unavailable' },
    );
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Could not load page 2');
    expect(element.querySelector('.run-grid')?.textContent).toContain('Strategy first');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 1');

    button('Retry').click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    respond(50, [backtest('second')], false);
    expect(element.querySelector('.run-grid')?.textContent).toContain('Strategy second');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 2');
  });

  it('offers retry for a failed first load and only one action when empty', () => {
    requestPage(0).flush(
      { detail: 'Service unavailable' },
      { status: 503, statusText: 'Unavailable' },
    );
    fixture.detectChanges();
    expect(element.textContent).not.toContain('No backtests yet');
    button('Retry').click();
    respond(0, [], false);
    expect(element.querySelectorAll('a[href="/backtests/new"]')).toHaveLength(1);
    expect(element.textContent).toContain('No backtests yet');
    expect(element.querySelector('nav')).toBeNull();
  });

  it('keeps Previous available when a later page becomes empty', () => {
    respond(0, [backtest('first')], true);
    button('Next').click();
    respond(50, [], false);
    expect(element.textContent).toContain('No backtests on this page');
    expect(button('Previous').disabled).toBe(false);
    expect(button('Next').disabled).toBe(true);
    button('Previous').click();
    respond(0, [backtest('first')], false);
    expect(element.querySelector('.run-grid')?.textContent).toContain('Strategy first');
  });
});

function backtest(id: string): BacktestListItem {
  return {
    id,
    strategy_id: 'strategy-id',
    strategy_version_id: 1,
    strategy_name: `Strategy ${id}`,
    symbol: 'AAPL',
    timeframe: '1d',
    start_date: '2026-08-01T00:00:00.000Z',
    end_date: '2026-08-02T00:00:00.000Z',
    initial_equity: '10000.00',
    status: 'completed',
    created_at: '2026-08-02T00:00:00.000Z',
    updated_at: '2026-08-02T00:00:00.000Z',
  };
}
