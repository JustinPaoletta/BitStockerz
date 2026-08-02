import type {
  ConditionOperator,
  StrategyCondition,
  StrategyConditionGroup,
} from '../../strategies/definition/strategy-definition.types';
import type { EngineBar } from './backtest-engine.types';
import type { IndicatorSeries } from './indicators';
import { evaluateCondition, evaluateRules } from './rules';

describe('backtest rule evaluation', () => {
  const bars = [bar(10, 9), bar(11, 10), bar(12, 11)];
  const indicators: IndicatorSeries = {
    fast: [null, 9, 12],
    slow: [8, 12, 11],
  };

  it.each([
    ['gt', 2, 1, true],
    ['gte', 2, 2, true],
    ['lt', 1, 2, true],
    ['lte', 2, 2, true],
    ['eq', 1 + 5e-10, 1, true],
    ['eq', 1 + 2e-9, 1, false],
  ] as const)('evaluates %s comparisons', (op, left, right, expected) => {
    expect(
      evaluateCondition(condition(op, { literal: left }, { literal: right }), {
        bars,
        indicators,
        index: 1,
      }),
    ).toBe(expected);
  });

  it('evaluates price and indicator operands in an AND group', () => {
    const group: StrategyConditionGroup = {
      logic: 'AND',
      conditions: [
        condition('gt', { price: 'close' }, { literal: 9 }),
        condition('lt', { indicator: 'fast' }, { indicator: 'slow' }),
      ],
    };

    expect(evaluateRules(group, { bars, indicators, index: 1 })).toBe(true);
    expect(evaluateRules(group, { bars, indicators, index: 2 })).toBe(false);
  });

  it('implements standard crossover semantics and null warmup behavior', () => {
    const above = condition(
      'crosses_above',
      { indicator: 'fast' },
      { indicator: 'slow' },
    );
    const below = condition(
      'crosses_below',
      { indicator: 'slow' },
      { literal: 11.5 },
    );

    expect(evaluateCondition(above, { bars, indicators, index: 1 })).toBe(
      false,
    );
    expect(evaluateCondition(above, { bars, indicators, index: 2 })).toBe(true);
    expect(evaluateCondition(below, { bars, indicators, index: 2 })).toBe(true);
  });

  it('returns false when a non-crossover operand is warming up', () => {
    expect(
      evaluateCondition(
        condition('gt', { indicator: 'fast' }, { literal: 0 }),
        { bars, indicators, index: 0 },
      ),
    ).toBe(false);
  });

  it('rejects malformed groups, operators, operands, and references', () => {
    expect(() =>
      evaluateRules(
        { logic: 'AND', conditions: [] },
        {
          bars,
          indicators,
          index: 1,
        },
      ),
    ).toThrow(/at least one/);
    expect(() =>
      evaluateRules(
        { logic: 'OR' as 'AND', conditions: [] },
        {
          bars,
          indicators,
          index: 1,
        },
      ),
    ).toThrow(/must use AND/);
    expect(() =>
      evaluateCondition(
        condition(
          'contains' as ConditionOperator,
          { literal: 1 },
          {
            literal: 1,
          },
        ),
        { bars, indicators, index: 1 },
      ),
    ).toThrow(/Unknown condition operator/);
    expect(() =>
      evaluateCondition(
        condition('gt', { indicator: 'missing' }, { literal: 1 }),
        { bars, indicators, index: 1 },
      ),
    ).toThrow(/unavailable/);
    expect(() =>
      evaluateCondition(
        condition('crosses_above', { literal: 1 }, { literal: 2 }),
        { bars, indicators, index: 1 },
      ),
    ).toThrow(/dynamic operand/);
    expect(() =>
      evaluateCondition(condition('gt', null as never, { literal: 2 }), {
        bars,
        indicators,
        index: 1,
      }),
    ).toThrow(/must be objects/);
  });
});

function condition(
  op: ConditionOperator,
  left: StrategyCondition['left'],
  right: StrategyCondition['right'],
): StrategyCondition {
  return { left, op, right };
}

function bar(close: number, open: number): EngineBar {
  return {
    ts: new Date('2026-01-01T00:00:00.000Z'),
    open,
    high: Math.max(open, close),
    low: Math.min(open, close),
    close,
    volume: 100,
  };
}
