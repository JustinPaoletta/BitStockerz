import type { IndicatorType, PriceSource } from './strategy-definition.types';

export interface IndicatorParameterDefinition {
  name: 'period';
  type: 'integer';
  min: number;
  max: number;
  default: number;
}

export interface IndicatorCatalogEntry {
  key: IndicatorType;
  display_name: string;
  description: string;
  params: readonly IndicatorParameterDefinition[];
  sources: readonly PriceSource[];
  default_source: PriceSource;
}

export const INDICATOR_CATALOG = [
  {
    key: 'SMA',
    display_name: 'Simple Moving Average',
    description: 'Arithmetic mean of source over period bars.',
    params: [
      { name: 'period', type: 'integer', min: 2, max: 200, default: 20 },
    ],
    sources: ['open', 'high', 'low', 'close'],
    default_source: 'close',
  },
  {
    key: 'EMA',
    display_name: 'Exponential Moving Average',
    description: 'Exponentially weighted moving average of source.',
    params: [
      { name: 'period', type: 'integer', min: 2, max: 200, default: 20 },
    ],
    sources: ['open', 'high', 'low', 'close'],
    default_source: 'close',
  },
  {
    key: 'RSI',
    display_name: 'Relative Strength Index',
    description: 'Momentum oscillator 0–100.',
    params: [
      { name: 'period', type: 'integer', min: 2, max: 100, default: 14 },
    ],
    sources: ['close'],
    default_source: 'close',
  },
] as const satisfies readonly IndicatorCatalogEntry[];

export type IndicatorCatalogResponse = {
  indicators: IndicatorCatalogEntry[];
};

export function getIndicatorCatalogResponse(): IndicatorCatalogResponse {
  return structuredClone({
    indicators: INDICATOR_CATALOG,
  }) as unknown as IndicatorCatalogResponse;
}
