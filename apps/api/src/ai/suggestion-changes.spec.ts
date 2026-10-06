import { validateSuggestionChanges } from './suggestion-changes';
import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
const definition: StrategyDefinition = {
  indicators: [
    { id: 'sma', type: 'SMA', params: { period: 20 }, source: 'close' },
  ],
  entry: {
    logic: 'AND',
    conditions: [
      { left: { indicator: 'sma' }, op: 'gt', right: { literal: 1 } },
    ],
  },
  exit: {
    logic: 'AND',
    conditions: [
      { left: { indicator: 'sma' }, op: 'lt', right: { literal: 1 } },
    ],
  },
  risk: {
    stop_loss: { type: 'percent', value: 2 },
    take_profit: { type: 'percent', value: 5 },
  },
};
it('validates combined parameter previews without mutating a strategy', () => {
  const changes = [
    {
      path: 'indicators[0].params.period',
      before: 20,
      after: 30,
      rationale: 'Test a slower horizon.',
    },
    {
      path: 'risk.stop_loss.value',
      before: 2,
      after: 3,
      rationale: 'Compare drawdown.',
    },
    {
      path: 'risk.take_profit.value',
      before: 5,
      after: 6,
      rationale: 'Test exit sensitivity.',
    },
  ];
  expect(validateSuggestionChanges(definition, changes)).toEqual(changes);
  expect(definition.indicators[0].params.period).toBe(20);
});
it.each([
  { path: '__proto__.polluted', before: 2, after: 3 },
  { path: 'indicators[5].params.period', before: 20, after: 30 },
  { path: 'risk.stop_loss.value', before: 9, after: 3 },
  { path: 'risk.stop_loss.value', before: 2, after: 2 },
  { path: 'risk.stop_loss.value', before: 2, after: NaN },
  { path: 'risk.stop_loss.value', before: 2, after: 99 },
  { path: 'indicators[0].params.period', before: 20, after: 1.1 },
])('rejects unsafe or invalid preview %p', (change) => {
  expect(() =>
    validateSuggestionChanges(definition, [{ ...change, rationale: 'Test' }]),
  ).toThrow();
});
it('rejects duplicate paths', () => {
  const change = {
    path: 'risk.stop_loss.value',
    before: 2,
    after: 3,
    rationale: 'Test',
  };
  expect(() =>
    validateSuggestionChanges(definition, [change, change]),
  ).toThrow();
});
