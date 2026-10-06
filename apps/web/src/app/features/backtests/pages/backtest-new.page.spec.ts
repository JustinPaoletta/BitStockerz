import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { SymbolSearchComponent } from '../../../shared/symbols/symbol-search.component';
import { BacktestNewPage } from './backtest-new.page';

describe('BacktestNewPage strategy selection', () => {
  let fixture: ComponentFixture<BacktestNewPage>;
  let http: HttpTestingController;
  const queryParams: Record<string, string> = {};

  beforeEach(async () => {
    delete queryParams['strategy_id'];
    await TestBed.configureTestingModule({
      imports: [BacktestNewPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(queryParams);
              },
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function open(strategyId?: string): void {
    if (strategyId) queryParams['strategy_id'] = strategyId;
    fixture = TestBed.createComponent(BacktestNewPage);
    fixture.detectChanges();
    http
      .expectOne('/api/strategies?limit=100&offset=0')
      .flush({
        items: [
          'crypto-strategy',
          'second-strategy',
          'slow-strategy',
          'current-strategy',
          'missing-strategy',
          'valid-strategy',
        ].map((id) => ({ id, name: id })),
        has_more: false,
      });
  }

  function fill(selector: string, value: string): void {
    const input = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    if (
      selector === '#strategy' &&
      value.trim() &&
      !input.querySelector(`option[value="${value.trim()}"]`)
    ) {
      const option = document.createElement('option');
      option.value = value.trim();
      option.textContent = value.trim();
      input.append(option);
    }
    if (selector === '#strategy') value = value.trim();
    input.value = value;
    input.dispatchEvent(
      new Event(selector === '#strategy' ? 'change' : 'input', { bubbles: true }),
    );
    fixture.detectChanges();
  }

  async function lookup(id: string) {
    await new Promise((resolve) => setTimeout(resolve, 280));
    return http.expectOne(`/api/strategies/${id}`);
  }

  function searchAssetType(): string {
    return fixture.debugElement.query(By.directive(SymbolSearchComponent)).componentInstance
      .assetType;
  }

  function timeframe(): HTMLSelectElement {
    return fixture.nativeElement.querySelector('#timeframe') as HTMLSelectElement;
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('resolves a selected strategy and submits its locked timeframe', async () => {
    open();
    fill('#strategy', ' crypto-strategy ');
    fill('#backtest-symbol', 'BTC-USD');
    fill('#start', '2026-08-01');
    fill('#end', '2026-08-02');
    expect(submitButton().disabled).toBe(true);

    // A form submission must also be guarded while the strategy is unresolved.
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    http.expectNone('/api/backtests');

    // The symbol input also runs its independent debounced lookup.
    (await lookup('crypto-strategy')).flush({
      id: 'crypto-strategy',
      name: 'Hourly crypto',
      asset_type: 'CRYPTO',
      timeframe: '1h',
    });
    http.expectOne((request) => request.url === '/api/symbols/search').flush({ items: [] });
    fixture.detectChanges();

    expect(timeframe().value).toBe('1h');
    expect(timeframe().disabled).toBe(true);
    expect(searchAssetType()).toBe('CRYPTO');
    expect(submitButton().disabled).toBe(false);
    submitButton().click();

    const request = http.expectOne('/api/backtests');
    expect(request.request.body).toMatchObject({
      strategy_id: 'crypto-strategy',
      timeframe: '1h',
      symbol: 'BTC-USD',
    });
    request.flush({ detail: 'Test run failed.' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
  });

  it('clears old metadata immediately and updates the asset and timeframe when the ID changes', async () => {
    open('first-strategy');
    (await lookup('first-strategy')).flush({
      id: 'first-strategy',
      name: 'Hourly crypto',
      asset_type: 'CRYPTO',
      timeframe: '1h',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Hourly crypto');

    fill('#strategy', 'second-strategy');
    expect(fixture.nativeElement.textContent).not.toContain('Hourly crypto');
    expect(searchAssetType()).toBe('');
    expect(timeframe().value).toBe('1d');
    expect(submitButton().disabled).toBe(true);

    (await lookup('second-strategy')).flush({
      id: 'second-strategy',
      name: 'Daily equity',
      asset_type: 'EQUITY',
      timeframe: '1d',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Daily equity');
    expect(searchAssetType()).toBe('EQUITY');
    expect(timeframe().value).toBe('1d');

    fill('#strategy', '');
    expect(fixture.nativeElement.textContent).not.toContain('Daily equity');
    expect(searchAssetType()).toBe('');
    expect(submitButton().disabled).toBe(true);
  });

  it('cancels an older lookup as soon as the strategy changes', async () => {
    open('slow-strategy');
    const staleRequest = await lookup('slow-strategy');
    fill('#strategy', 'current-strategy');
    expect(staleRequest.cancelled).toBe(true);

    (await lookup('current-strategy')).flush({
      id: 'current-strategy',
      name: 'Current strategy',
      asset_type: 'CRYPTO',
      timeframe: '1h',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Current strategy');
    expect(searchAssetType()).toBe('CRYPTO');
    expect(timeframe().value).toBe('1h');
  });

  it('keeps failed lookups blocked and recovers after entering a valid ID', async () => {
    open('missing-strategy');
    (await lookup('missing-strategy')).flush(
      { detail: 'Strategy not found.' },
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Strategy not found.');
    expect(submitButton().disabled).toBe(true);
    expect(searchAssetType()).toBe('');

    fill('#strategy', 'valid-strategy');
    expect(fixture.nativeElement.textContent).not.toContain('Strategy not found.');
    (await lookup('valid-strategy')).flush({
      id: 'valid-strategy',
      name: 'Valid strategy',
      asset_type: 'EQUITY',
      timeframe: '1d',
    });
    fill('#start', '2026-08-01');
    fill('#end', '2026-08-02');
    expect(submitButton().disabled).toBe(false);
  });
});
