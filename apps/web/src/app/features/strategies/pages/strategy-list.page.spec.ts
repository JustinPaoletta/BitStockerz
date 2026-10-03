import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { StrategySummary } from '../data/strategies-api.service';
import { StrategyListPage } from './strategy-list.page';

describe('StrategyListPage', () => {
  let fixture: ComponentFixture<StrategyListPage>;
  let http: HttpTestingController;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StrategyListPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(StrategyListPage);
    http = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function requestPage(offset: number) {
    return http.expectOne(
      (request) =>
        request.url === '/api/strategies' &&
        request.params.get('limit') === '50' &&
        request.params.get('offset') === String(offset),
    );
  }

  function button(label: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === label,
    )!;
  }

  function respond(offset: number, items: StrategySummary[], hasMore: boolean): void {
    requestPage(offset).flush({ items, offset, limit: 50, has_more: hasMore });
    fixture.detectChanges();
  }

  it('pages in both directions, honors has_more, and exposes a named native link', () => {
    respond(0, [strategy('first')], true);
    const link = element.querySelector<HTMLAnchorElement>('tbody a');
    expect(link?.getAttribute('href')).toBe('/strategies/first');
    expect(link?.textContent?.trim()).toBe('Strategy first');
    expect(button('Previous').disabled).toBe(true);

    button('Next').click();
    fixture.detectChanges();
    expect(button('Next').disabled).toBe(true);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Loading page 2');
    respond(50, [strategy('second')], false);

    expect(element.querySelector('tbody')?.textContent).toContain('Strategy second');
    expect(element.querySelector('tbody')?.textContent).not.toContain('Strategy first');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 2');
    expect(button('Next').disabled).toBe(true);
    expect(button('Previous').disabled).toBe(false);

    button('Previous').click();
    respond(0, [strategy('first')], true);
    expect(button('Previous').disabled).toBe(true);
    expect(button('Next').disabled).toBe(false);
  });

  it('keeps the last successful page after an error and retries the failed page', () => {
    respond(0, [strategy('first')], true);
    button('Next').click();
    requestPage(50).flush(
      { detail: 'Service unavailable' },
      { status: 503, statusText: 'Unavailable' },
    );
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Could not load page 2');
    expect(element.querySelector('tbody')?.textContent).toContain('Strategy first');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 1');

    button('Retry').click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    respond(50, [strategy('second')], false);
    expect(element.querySelector('tbody')?.textContent).toContain('Strategy second');
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Page 2');
  });

  it('uses only the header create action when the first page is empty', () => {
    respond(0, [], false);
    expect(element.querySelectorAll('a[href="/strategies/new"]')).toHaveLength(1);
    expect(element.textContent).toContain('Create your first strategy');
    expect(element.querySelector('nav')).toBeNull();
  });

  it('keeps Previous available when a later page becomes empty', () => {
    respond(0, [strategy('first')], true);
    button('Next').click();
    respond(50, [], false);
    expect(element.textContent).toContain('No strategies on this page');
    expect(button('Previous').disabled).toBe(false);
    expect(button('Next').disabled).toBe(true);
    button('Previous').click();
    respond(0, [strategy('first')], false);
    expect(element.querySelector('tbody')?.textContent).toContain('Strategy first');
  });
});

function strategy(id: string): StrategySummary {
  return {
    id,
    name: `Strategy ${id}`,
    asset_type: 'EQUITY',
    timeframe: '1d',
    version_number: 1,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}
