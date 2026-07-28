import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { EngineEquityPoint, EngineTrade } from './backtest-engine.types';
import { calculateMetrics } from './metrics';

describe('backtest metrics', () => {
  it('calculates return, drawdown, trade aggregates, and simple Sharpe', () => {
    const metrics = calculateMetrics(
      100,
      [trade(10, 10), trade(-5, -5), trade(0, 0)],
      curve(100, 110, 99, 108),
    );

    expect(metrics.finalEquity).toBe(108);
    expect(metrics.totalReturnPct).toBeCloseTo(8);
    expect(metrics.maxDrawdownPct).toBeCloseTo(10);
    expect(metrics.winRatePct).toBeCloseTo(100 / 3);
    expect(metrics.numTrades).toBe(3);
    expect(metrics.avgWinPct).toBe(10);
    expect(metrics.avgLossPct).toBe(-5);
    expect(metrics.sharpeRatio).not.toBeNull();
    expect(Number.isFinite(metrics.sharpeRatio as number)).toBe(true);
  });

  it('returns stable zero trade metrics and nullable undefined Sharpe', () => {
    expect(calculateMetrics(100, [], curve(100, 100, 100))).toEqual({
      finalEquity: 100,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      numTrades: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      sharpeRatio: null,
    });
    expect(calculateMetrics(100, [], [])).toMatchObject({
      finalEquity: 100,
      sharpeRatio: null,
    });
    expect(calculateMetrics(100, [], curve(100, 101)).sharpeRatio).toBeNull();
  });

  it('fails closed when arithmetic cannot produce persistable values', () => {
    expectCode(
      () => calculateMetrics(100, [], curve(100, Number.POSITIVE_INFINITY)),
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    );
    expectCode(
      () => calculateMetrics(100, [], curve(0, 1, 2)),
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    );
  });
});

function expectCode(action: () => unknown, code: ErrorCode): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toMatchObject({ code });
  }
}

function curve(...equities: number[]): EngineEquityPoint[] {
  return equities.map((equity, index) => ({
    ts: new Date(Date.UTC(2026, 0, index + 1)),
    equity,
  }));
}

function trade(pnlAbs: number, pnlPct: number): EngineTrade {
  return {
    entryTime: new Date('2026-01-01T00:00:00.000Z'),
    exitTime: new Date('2026-01-02T00:00:00.000Z'),
    side: 'long',
    entryPrice: 100,
    exitPrice: 100 + pnlPct,
    quantity: 1,
    pnlAbs,
    pnlPct,
  };
}
