import type { StrategyDefinition, StrategyDetail } from './strategies-api.service';

export interface StrategyEditorValues {
  name: string;
  description: string;
  asset_type: 'EQUITY' | 'CRYPTO';
  timeframe: '1d' | '1h';
  indicator_id: string;
  indicator_type: string;
  period: number;
  entry_op: string;
  entry_literal: number;
  exit_op: string;
  exit_literal: number;
  stop_loss: number;
  take_profit: number;
}

export function buildStrategyDefinition(values: StrategyEditorValues): StrategyDefinition {
  return {
    indicators: [
      {
        id: values.indicator_id,
        type: values.indicator_type,
        params: { period: values.period },
        source: 'close',
      },
    ],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: values.indicator_id },
          op: values.entry_op,
          right: { literal: values.entry_literal },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: values.indicator_id },
          op: values.exit_op,
          right: { literal: values.exit_literal },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: values.stop_loss },
      take_profit: { type: 'percent', value: values.take_profit },
    },
  };
}

export function editorValuesFromDetail(detail: StrategyDetail): Partial<StrategyEditorValues> {
  const indicator = detail.definition.indicators[0];
  const entry = detail.definition.entry.conditions[0];
  const exit = detail.definition.exit.conditions[0];
  return {
    name: detail.name,
    description: detail.description ?? '',
    asset_type: detail.asset_type,
    timeframe: detail.timeframe,
    indicator_id: indicator?.id ?? 'sma',
    indicator_type: indicator?.type ?? 'SMA',
    period: indicator?.params?.['period'] ?? 20,
    entry_op: entry?.op ?? 'gt',
    entry_literal:
      entry && 'literal' in entry.right ? Number(entry.right.literal) : 100,
    exit_op: exit?.op ?? 'lt',
    exit_literal: exit && 'literal' in exit.right ? Number(exit.right.literal) : 90,
    stop_loss: detail.definition.risk.stop_loss.value,
    take_profit: detail.definition.risk.take_profit.value,
  };
}

export function definitionsEqual(a: StrategyDefinition, b: StrategyDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
