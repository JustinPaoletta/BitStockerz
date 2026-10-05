import type { StrategyDefinition } from './strategies-api.service';

export const STRATEGY_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  definition: StrategyDefinition;
}[] = [
  {
    id: 'sma-cross',
    name: 'Moving average crossover',
    description:
      'Enter when the 10-bar SMA crosses above the 30-bar SMA; exit on the reverse crossover.',
    definition: {
      indicators: [
        { id: 'fast', type: 'SMA', params: { period: 10 }, source: 'close' },
        { id: 'slow', type: 'SMA', params: { period: 30 }, source: 'close' },
      ],
      entry: {
        logic: 'AND',
        conditions: [
          { left: { indicator: 'fast' }, op: 'crosses_above', right: { indicator: 'slow' } },
        ],
      },
      exit: {
        logic: 'AND',
        conditions: [
          { left: { indicator: 'fast' }, op: 'crosses_below', right: { indicator: 'slow' } },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: 2 },
        take_profit: { type: 'percent', value: 5 },
      },
    },
  },
  {
    id: 'rsi-recovery',
    name: 'RSI recovery',
    description: 'Enter when RSI crosses back above 30; exit when it crosses above 70.',
    definition: {
      indicators: [{ id: 'rsi', type: 'RSI', params: { period: 14 }, source: 'close' }],
      entry: {
        logic: 'AND',
        conditions: [{ left: { indicator: 'rsi' }, op: 'crosses_above', right: { literal: 30 } }],
      },
      exit: {
        logic: 'AND',
        conditions: [{ left: { indicator: 'rsi' }, op: 'crosses_above', right: { literal: 70 } }],
      },
      risk: {
        stop_loss: { type: 'percent', value: 2 },
        take_profit: { type: 'percent', value: 5 },
      },
    },
  },
];
