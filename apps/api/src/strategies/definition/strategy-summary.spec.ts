import type { StrategyDefinition } from './strategy-definition.types';
import { summarizeStrategyDefinition } from './strategy-summary';

describe('summarizeStrategyDefinition', () => {
  it('renders canonical rules in stable condition order', () => {
    const definition: StrategyDefinition = {
      indicators: [
        {
          id: 'fast',
          type: 'SMA',
          params: { period: 10 },
          source: 'close',
        },
        {
          id: 'slow',
          type: 'SMA',
          params: { period: 30 },
          source: 'close',
        },
        {
          id: 'rsi',
          type: 'RSI',
          params: { period: 14 },
          source: 'close',
        },
      ],
      entry: {
        logic: 'AND',
        conditions: [
          {
            left: { indicator: 'fast' },
            op: 'crosses_above',
            right: { indicator: 'slow' },
          },
          {
            left: { indicator: 'rsi' },
            op: 'lt',
            right: { literal: 70 },
          },
        ],
      },
      exit: {
        logic: 'AND',
        conditions: [
          {
            left: { indicator: 'fast' },
            op: 'crosses_below',
            right: { indicator: 'slow' },
          },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: 2 },
        take_profit: { type: 'percent', value: 500 },
      },
    };

    expect(summarizeStrategyDefinition(definition)).toBe(
      'Buy when SMA(10) crosses above SMA(30) AND RSI(14) < 70. ' +
        'Exit when SMA(10) crosses below SMA(30). Stop loss 2%. ' +
        'Take profit 500%.',
    );
  });

  it('renders price, literal, equality, and inclusive operators', () => {
    const definition: StrategyDefinition = {
      indicators: [],
      entry: {
        logic: 'AND',
        conditions: [
          {
            left: { price: 'close' },
            op: 'gte',
            right: { literal: 10.5 },
          },
          {
            left: { price: 'low' },
            op: 'eq',
            right: { literal: 9 },
          },
        ],
      },
      exit: {
        logic: 'AND',
        conditions: [
          {
            left: { price: 'high' },
            op: 'lte',
            right: { literal: 12 },
          },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: 1.5 },
        take_profit: { type: 'percent', value: 3.25 },
      },
    };

    expect(summarizeStrategyDefinition(definition)).toBe(
      'Buy when close price >= 10.5 AND low price = 9. ' +
        'Exit when high price <= 12. Stop loss 1.5%. Take profit 3.25%.',
    );
  });
});
