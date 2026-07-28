import { DomainError } from '../../common/errors/domain-error';
import type { StrategyIndicator } from '../../strategies/definition/strategy-definition.types';
import type { EngineBar } from './backtest-engine.types';
import {
  computeIndicators,
  exponentialMovingAverage,
  relativeStrengthIndex,
  simpleMovingAverage,
} from './indicators';

describe('backtest indicators', () => {
  it('computes an aligned SMA with null warmup values', () => {
    expect(simpleMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([
      null,
      null,
      2,
      3,
      4,
    ]);
  });

  it('seeds EMA with an SMA and then applies the recursive multiplier', () => {
    expect(exponentialMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([
      null,
      null,
      2,
      3,
      4,
    ]);
    expect(exponentialMovingAverage([1, 2], 3)).toEqual([null, null]);
  });

  it('computes Wilder RSI with deterministic flat and zero-loss behavior', () => {
    expect(relativeStrengthIndex([1, 2, 3, 2, 2, 4], 2)).toEqual([
      null,
      null,
      100,
      50,
      50,
      90,
    ]);
    expect(relativeStrengthIndex([5, 5, 5, 5], 2)).toEqual([
      null,
      null,
      50,
      50,
    ]);
    expect(relativeStrengthIndex([4, 3, 2, 1], 2)).toEqual([null, null, 0, 0]);
    expect(relativeStrengthIndex([1, 2], 2)).toEqual([null, null]);
  });

  it('computes named series from each supported source', () => {
    const bars = [bar(1, 2, 0.5, 1.5), bar(2, 3, 1.5, 2.5)];
    const indicators: StrategyIndicator[] = [
      { id: 'open', type: 'SMA', params: { period: 1 }, source: 'open' },
      { id: 'high', type: 'EMA', params: { period: 1 }, source: 'high' },
      { id: 'low', type: 'SMA', params: { period: 1 }, source: 'low' },
      { id: 'close', type: 'SMA', params: { period: 1 }, source: 'close' },
    ];

    const result = computeIndicators(indicators, bars);

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.open).toEqual([1, 2]);
    expect(result.high).toEqual([2, 3]);
    expect(result.low).toEqual([0.5, 1.5]);
    expect(result.close).toEqual([1.5, 2.5]);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid period %p', (period) => {
    expect(() => simpleMovingAverage([1, 2], period)).toThrow(DomainError);
  });

  it('rejects duplicate ids, unknown types, and unknown sources', () => {
    const bars = [bar(1, 2, 0.5, 1.5)];
    const base = {
      id: 'same',
      type: 'SMA',
      params: { period: 1 },
      source: 'close',
    } as StrategyIndicator;

    expect(() => computeIndicators([base, base], bars)).toThrow(/duplicated/);
    expect(() =>
      computeIndicators([{ ...base, type: 'MACD' as 'SMA' }], bars),
    ).toThrow(/Unknown indicator type/);
    expect(() =>
      computeIndicators([{ ...base, source: 'volume' as 'close' }], bars),
    ).toThrow(/Unknown indicator source/);
    expect(() => computeIndicators([{ ...base, id: '' }], bars)).toThrow(
      /non-empty id/,
    );
  });
});

function bar(
  open: number,
  high: number,
  low: number,
  close: number,
): EngineBar {
  return {
    ts: new Date('2026-01-01T00:00:00.000Z'),
    open,
    high,
    low,
    close,
    volume: 100,
  };
}
