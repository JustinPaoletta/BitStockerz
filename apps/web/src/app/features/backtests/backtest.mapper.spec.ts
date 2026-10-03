import fixture from '../../../../../../docs/manual-testing/fixtures/backtest-detail.example.json';
import {
  mapBacktestDetail,
  mapBacktestList,
  mapCreateBacktest,
  toChartPoints,
  toTradeMarkers,
} from './backtest.mapper';

describe('backtest mapper contract', () => {
  it('sorts UTC daily markers, keeps same-bar entries and exits, and deduplicates pages', () => {
    const trade = mapBacktestDetail(fixture).trades[0];
    const points = [
      { timestamp: '2026-07-02T00:00:00Z', equity: '10000' },
      { timestamp: '2026-07-01T00:00:00Z', equity: '10000' },
    ];
    const trades = [
      { ...trade, id: 2, entry_time: '2026-07-02T00:00:00Z', exit_time: '2026-07-02T01:00:00Z' },
      {
        ...trade,
        id: 1,
        entry_time: '2026-06-30T20:00:00-04:00',
        exit_time: '2026-07-02T00:00:00Z',
      },
    ];
    const markers = toTradeMarkers([...trades, trades[0]], points, '1d');
    expect(markers.map(({ id, time }) => ({ id, time }))).toEqual([
      { id: 'entry-1', time: '2026-07-01' },
      { id: 'entry-2', time: '2026-07-02' },
      { id: 'exit-2', time: '2026-07-02' },
      { id: 'exit-1', time: '2026-07-02' },
    ]);
    expect(markers[0]).toMatchObject({ text: 'Entry', shape: 'arrowUp', position: 'belowBar' });
    expect(markers[2]).toMatchObject({ text: 'Exit', shape: 'arrowDown', position: 'aboveBar' });
    expect(toChartPoints([...points, points[0]], '1d')).toHaveLength(2);
  });

  it('uses distinct hourly timestamps and omits malformed or off-curve events', () => {
    const trade = {
      ...mapBacktestDetail(fixture).trades[0],
      entry_time: '2026-01-01T00:00:00Z',
      exit_time: '2026-01-01T01:00:00Z',
    };
    const points = [
      { timestamp: trade.entry_time, equity: '10000' },
      { timestamp: trade.exit_time, equity: '10010' },
    ];
    expect(toTradeMarkers([trade], points, '1h').map((marker) => marker.time)).toEqual([
      1767225600, 1767229200,
    ]);
    expect(
      toTradeMarkers(
        [
          { ...trade, entry_time: 'invalid' },
          { ...trade, id: 2, exit_time: '2025-01-01' },
        ],
        points,
        '1h',
      ),
    ).toEqual([]);
    expect(toTradeMarkers([trade], [], '1d')).toEqual([]);
    expect(toTradeMarkers([trade], [points[0]], '1h').map((marker) => marker.id)).toEqual([
      `entry-${trade.id}`,
    ]);
  });
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
