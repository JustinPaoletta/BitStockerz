import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { StrategyDetailPage } from './strategy-detail.page';

describe('StrategyDetailPage historical versions', () => {
  const strategyId = 'strategy-id';

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StrategyDetailPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: strategyId }) } },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('offers backtesting only for the latest displayed version and explains how to restore it', () => {
    const fixture = TestBed.createComponent(StrategyDetailPage);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    http.expectOne(`/api/strategies/${strategyId}`).flush(strategyVersion(2, true));
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const runLink = () => element.querySelector<HTMLAnchorElement>('a[href^="/backtests/new"]');
    expect(runLink()?.textContent).toContain('Run backtest');
    expect(runLink()?.getAttribute('href')).toBe(`/backtests/new?strategy_id=${strategyId}`);

    const historicalVersion = element.querySelector<HTMLSelectElement>('#version')!;
    historicalVersion.value = '1';
    historicalVersion.dispatchEvent(new Event('change'));
    http.expectOne(`/api/strategies/${strategyId}?version=1`).flush(strategyVersion(1, false));
    fixture.detectChanges();

    expect(runLink()).toBeNull();
    expect(element.textContent).toContain('Historical version');
    expect(element.textContent).toContain('Choose the latest version to edit or run a backtest.');

    const latestVersion = element.querySelector<HTMLSelectElement>('#version')!;
    latestVersion.value = '2';
    latestVersion.dispatchEvent(new Event('change'));
    http.expectOne(`/api/strategies/${strategyId}?version=2`).flush(strategyVersion(2, true));
    fixture.detectChanges();

    expect(runLink()?.textContent).toContain('Run backtest');
    expect(element.textContent).not.toContain('Historical version');
  });
});

function strategyVersion(version: number, latest: boolean) {
  return {
    id: 'strategy-id',
    name: 'Daily equity',
    asset_type: 'EQUITY',
    timeframe: '1d',
    version_number: version,
    is_latest: latest,
    definition: {},
    updated_at: '2026-08-01T00:00:00.000Z',
  };
}
