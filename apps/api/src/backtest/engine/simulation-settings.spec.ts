import { runBacktest } from './run';
import { normalizeSimulation } from './simulation-settings';
import { calculateBenchmark } from './benchmark';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
const definition: StrategyDefinition = {
  indicators: [],
  entry: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'gt', right: { literal: 0 } }],
  },
  exit: {
    logic: 'AND',
    conditions: [{ left: { price: 'close' }, op: 'lt', right: { literal: 0 } }],
  },
  risk: {
    stop_loss: { type: 'percent', value: 50 },
    take_profit: { type: 'percent', value: 500 },
  },
};
const bars = [100, 120].map((close, index) => ({
  ts: new Date(Date.UTC(2026, 0, index + 1)),
  open: close,
  high: close,
  low: close,
  close,
  volume: 100,
}));
describe('simulation realism', () => {
  it('retains cash and charges both commissions with adverse fills', () => {
    const output = runBacktest(
      {
        definition,
        bars,
        initialEquity: 1000,
        simulation: {
          allocation_pct: 50,
          commission_bps: 100,
          slippage_bps: 100,
        },
      },
      { now: () => 0 },
    );
    const trade = output.trades[0];
    const quantity = 500 / (101 * 1.01);
    const exit = 118.8;
    expect(trade.entryPrice).toBe(101);
    expect(trade.exitPrice).toBeCloseTo(exit);
    expect(trade.quantity).toBeCloseTo(quantity);
    expect(trade.feesAbs).toBeCloseTo(quantity * (101 + exit) * 0.01);
    expect(trade.pnlAbs).toBeCloseTo(quantity * (exit - 101) - trade.feesAbs!);
    expect(output.metrics.finalEquity).toBeCloseTo(1000 + trade.pnlAbs);
    expect(output.benchmark?.final_equity).toBe(
      output.metrics.finalEquity.toFixed(2),
    );
    expect(output).toEqual(
      runBacktest(
        {
          definition,
          bars,
          initialEquity: 1000,
          simulation: {
            allocation_pct: 50,
            commission_bps: 100,
            slippage_bps: 100,
          },
        },
        { now: () => 0 },
      ),
    );
  });
  it('executes a close signal at the next open and expires final-bar entries', () => {
    const gap = [bars[0], { ...bars[1], open: 110, low: 110 }];
    const output = runBacktest({
      definition,
      bars: gap,
      initialEquity: 1000,
      simulation: { execution_timing: 'next_open' },
    });
    expect(output.trades[0]).toMatchObject({
      entryTime: gap[1].ts,
      entryPrice: 110,
      exitPrice: 120,
    });
    expect(output.metrics.finalEquity).toBeCloseTo((1000 * 120) / 110);
    expect(
      runBacktest({
        definition,
        bars: [bars[0]],
        initialEquity: 1000,
        simulation: { execution_timing: 'next_open' },
      }).trades,
    ).toHaveLength(0);
  });
  it('supports same-bar risk on next-open entries, stop before target', () => {
    const output = runBacktest({
      definition: {
        ...definition,
        risk: {
          stop_loss: { type: 'percent', value: 5 },
          take_profit: { type: 'percent', value: 5 },
        },
      },
      bars: [bars[0], { ...bars[1], open: 100, low: 90, high: 125 }],
      initialEquity: 1000,
      simulation: { execution_timing: 'next_open' },
    });
    expect(output.trades[0].exitPrice).toBe(95);
    expect(output.metrics.finalEquity).toBe(950);
  });
  it.each([
    { allocation_pct: 0 },
    { allocation_pct: NaN },
    { commission_bps: -1 },
    { slippage_bps: 1001 },
    { execution_timing: 'bad' },
    { evaluation_period: 'bad' },
  ])('rejects invalid settings %p', (value) => {
    expect(() => normalizeSimulation(value as never)).toThrow();
  });
  it('benchmarks missing next-open bars and tracks losses', () => {
    expect(
      calculateBenchmark(
        [bars[0]],
        1000,
        normalizeSimulation({ execution_timing: 'next_open' }),
      ).final_equity,
    ).toBe('1000.00');
    expect(
      calculateBenchmark(
        [...bars]
          .reverse()
          .map((bar, index) => ({ ...bar, ts: bars[index].ts })),
        1000,
        normalizeSimulation(),
      ).max_drawdown_pct,
    ).toBe('16.6667');
  });
  it('fills exit signals at the following open without reentering that bar', () => {
    const next = [
      bars[0],
      { ...bars[1], open: 110, low: 110, close: 130, high: 130 },
      {
        ...bars[1],
        ts: new Date('2026-01-03'),
        open: 140,
        low: 140,
        high: 150,
        close: 150,
      },
    ];
    const output = runBacktest({
      definition: {
        ...definition,
        exit: {
          logic: 'AND',
          conditions: [
            { left: { price: 'close' }, op: 'gte', right: { literal: 130 } },
          ],
        },
      },
      bars: next,
      initialEquity: 1000,
      simulation: { execution_timing: 'next_open' },
    });
    expect(output.trades).toHaveLength(1);
    expect(output.trades[0]).toMatchObject({
      entryPrice: 110,
      exitPrice: 140,
      exitTime: next[2].ts,
    });
  });
});
