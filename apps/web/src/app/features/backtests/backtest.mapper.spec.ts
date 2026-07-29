import fixture from '../../../../../../docs/manual-testing/fixtures/backtest-detail.example.json';
import {
  mapBacktestDetail,
  mapBacktestList,
  mapCreateBacktest,
  toChartPoints,
} from './backtest.mapper';

describe('backtest mapper contract', () => {
  it('maps the checked-in API fixture and preserves decimal strings', () => {
    const detail = mapBacktestDetail(fixture);
    expect(detail.run.symbol).toBe('AAPL');
    expect(detail.results?.final_equity).toBe('10125.50');
    expect(detail.trades[0].entry_price).toBe('200.00000000');
    expect(toChartPoints(detail.equity_curve, '1d')).toEqual([
      { time: '2026-07-01', value: 10000 },
      { time: '2026-07-03', value: 10210 },
      { time: '2026-07-08', value: 10125.5 },
    ]);
  });

  it('maps intraday timestamps and rejects drifted fixture shapes', () => {
    expect(
      toChartPoints(
        [
          { timestamp: '2026-01-01T00:00:00.000Z', equity: '10.5' },
          { timestamp: 'invalid', equity: 'NaN' },
        ],
        '1h',
      ),
    ).toEqual([{ time: 1767225600, value: 10.5 }]);
    expect(() => mapBacktestDetail({})).toThrow();
    expect(() =>
      mapBacktestDetail({
        run: {},
        trades: [],
        equity_curve: [],
        trades_page: null,
      }),
    ).toThrow();
    expect(() =>
      mapBacktestDetail({
        run: {},
        trades: [],
        trades_page: {},
        equity_curve: [{ timestamp: 'bad', equity: '1' }],
      }),
    ).toThrow();
    expect(() =>
      mapBacktestDetail({
        ...fixture,
        trades: [{ ...fixture.trades[0], id: '101' }],
      }),
    ).toThrow('Backtest trade is invalid.');
    expect(() =>
      mapBacktestDetail({
        ...fixture,
        trades_page: { limit: 0, offset: 0, has_more: false },
      }),
    ).toThrow('Backtest trade pagination is invalid.');
  });

  it('validates list and create response boundaries', () => {
    expect(
      mapBacktestList({
        items: [
          {
            ...fixture.run,
            strategy_name: 'Fixture',
            total_return_pct: '1.2500',
            max_drawdown_pct: '0.5000',
            num_trades: 2,
          },
        ],
        limit: 50,
        offset: 0,
        has_more: false,
      }).items[0].strategy_name,
    ).toBe('Fixture');
    expect(mapCreateBacktest({ run: fixture.run, results: fixture.results }).run.id).toBe(
      fixture.run.id,
    );
    expect(() =>
      mapBacktestList({
        items: [{ ...fixture.run, strategy_name: 'Broken', num_trades: -1 }],
        limit: 50,
        offset: 0,
        has_more: false,
      }),
    ).toThrow('Backtest list item is invalid.');
  });
});
