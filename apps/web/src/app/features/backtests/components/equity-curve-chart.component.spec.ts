import { TestBed } from '@angular/core/testing';
import fixtureData from '../../../../../../../docs/manual-testing/fixtures/backtest-detail.example.json';
import { EquityCurveChartComponent } from './equity-curve-chart.component';
import { mapBacktestDetail } from '../backtest.mapper';

const chart = vi.hoisted(() => ({
  create: vi.fn(),
  setData: vi.fn(),
  setMarkers: vi.fn(),
  detach: vi.fn(),
  remove: vi.fn(),
  fitContent: vi.fn(),
  applyOptions: vi.fn(),
}));
vi.mock('lightweight-charts', () => ({
  ColorType: { Solid: 'solid' },
  LineSeries: {},
  createChart: chart.create,
  createSeriesMarkers: () => ({ setMarkers: chart.setMarkers, detach: chart.detach }),
}));

describe('EquityCurveChartComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chart.create.mockReturnValue({
      addSeries: () => ({ setData: chart.setData }),
      timeScale: () => ({ fitContent: chart.fitContent }),
      remove: chart.remove,
      applyOptions: chart.applyOptions,
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    TestBed.configureTestingModule({ imports: [EquityCurveChartComponent] });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('updates paginated markers without resetting zoom and tears down the plugin', async () => {
    const fixture = TestBed.createComponent(EquityCurveChartComponent);
    fixture.componentRef.setInput('points', [
      ...fixtureData.equity_curve,
      { timestamp: fixtureData.trades[0].entry_time, equity: '10000' },
    ]);
    fixture.componentRef.setInput('timeframe', '1d');
    fixture.componentRef.setInput('trades', []);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.create).toHaveBeenCalledTimes(1);
    expect(chart.setData).toHaveBeenCalledTimes(1);
    expect(chart.setMarkers).toHaveBeenLastCalledWith([]);

    fixture.componentRef.setInput('trades', [mapBacktestDetail(fixtureData).trades[0]]);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.setMarkers).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Entry' }),
        expect.objectContaining({ text: 'Exit' }),
      ]),
    );
    expect(chart.setData).toHaveBeenCalledTimes(1);
    expect(chart.fitContent).toHaveBeenCalledTimes(1);
    fixture.destroy();
    expect(chart.detach).toHaveBeenCalledTimes(1);
    expect(chart.remove).toHaveBeenCalledTimes(1);
  });

  it('creates the chart when empty data becomes available and removes it when cleared', async () => {
    const fixture = TestBed.createComponent(EquityCurveChartComponent);
    fixture.componentRef.setInput('points', []);
    fixture.componentRef.setInput('timeframe', '1h');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.create).not.toHaveBeenCalled();
    fixture.componentRef.setInput('points', fixtureData.equity_curve);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.create).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('points', []);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(chart.remove).toHaveBeenCalledTimes(1);
  });
});
