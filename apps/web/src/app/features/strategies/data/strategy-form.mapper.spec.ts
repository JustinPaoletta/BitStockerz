import {
  buildStrategyDefinition,
  definitionsEqual,
  editorValuesFromDetail,
} from './strategy-form.mapper';
import type { StrategyDefinition, StrategyDetail } from './strategies-api.service';

const sampleValues = {
  name: 'Trend',
  description: 'demo',
  asset_type: 'EQUITY' as const,
  timeframe: '1d' as const,
  indicator_id: 'sma',
  indicator_type: 'SMA',
  period: 20,
  entry_op: 'gt',
  entry_literal: 100,
  exit_op: 'lt',
  exit_literal: 90,
  stop_loss: 2,
  take_profit: 5,
};

describe('strategy-form.mapper', () => {
  it('serializes editor values into the canonical definition shape', () => {
    expect(buildStrategyDefinition(sampleValues)).toEqual({
      indicators: [{ id: 'sma', type: 'SMA', params: { period: 20 }, source: 'close' }],
      entry: {
        logic: 'AND',
        conditions: [{ left: { indicator: 'sma' }, op: 'gt', right: { literal: 100 } }],
      },
      exit: {
        logic: 'AND',
        conditions: [{ left: { indicator: 'sma' }, op: 'lt', right: { literal: 90 } }],
      },
      risk: {
        stop_loss: { type: 'percent', value: 2 },
        take_profit: { type: 'percent', value: 5 },
      },
    } satisfies StrategyDefinition);
  });

  it('round-trips detail metadata into editor values', () => {
    const definition = buildStrategyDefinition(sampleValues);
    const detail = {
      id: 's1',
      name: 'Trend',
      description: 'demo',
      asset_type: 'EQUITY',
      timeframe: '1d',
      version_number: 1,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z',
      definition,
    } satisfies StrategyDetail;

    expect(editorValuesFromDetail(detail)).toMatchObject({
      name: 'Trend',
      indicator_id: 'sma',
      entry_literal: 100,
      stop_loss: 2,
    });
  });

  it('compares definitions structurally', () => {
    const a = buildStrategyDefinition(sampleValues);
    const b = buildStrategyDefinition({ ...sampleValues, period: 21 });
    expect(definitionsEqual(a, a)).toBe(true);
    expect(definitionsEqual(a, b)).toBe(false);
  });
});
