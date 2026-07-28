import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { EngineBar } from './backtest-engine.types';
import { evaluateRiskExit } from './risk-exits';

describe('backtest risk exits', () => {
  it('uses stop-first priority when the same bar touches SL and TP', () => {
    expect(
      evaluateRiskExit(100, bar(94, 111), {
        stop_loss: { type: 'percent', value: 5 },
        take_profit: { type: 'percent', value: 10 },
      }),
    ).toEqual({ price: 95, reason: 'stop_loss' });
  });

  it('returns a take-profit exit when only its threshold is touched', () => {
    expect(
      evaluateRiskExit(100, bar(99, 600), {
        stop_loss: { type: 'percent', value: 5 },
        take_profit: { type: 'percent', value: 500 },
      }),
    ).toEqual({ price: 600, reason: 'take_profit' });
  });

  it('skips absent legacy risk rules and untouched thresholds', () => {
    expect(evaluateRiskExit(100, bar(99, 101), undefined)).toBeNull();
    expect(
      evaluateRiskExit(100, bar(99, 101), {
        stop_loss: { type: 'percent', value: 5 },
      }),
    ).toBeNull();
  });

  it('fails closed for invalid rules and numeric overflow', () => {
    expectCode(
      () =>
        evaluateRiskExit(100, bar(99, 101), {
          stop_loss: { type: 'percent', value: 0 },
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
    expectCode(
      () =>
        evaluateRiskExit(Number.MAX_VALUE, bar(1, Number.MAX_VALUE), {
          take_profit: { type: 'percent', value: 500 },
        }),
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

function bar(low: number, high: number): EngineBar {
  return {
    ts: new Date('2026-01-01T00:00:00.000Z'),
    open: 100,
    high,
    low,
    close: 100,
    volume: 100,
  };
}
