export const PRICE_SOURCES = ['open', 'high', 'low', 'close'] as const;
export const CONDITION_OPERATORS = [
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'crosses_above',
  'crosses_below',
] as const;

export type PriceSource = (typeof PRICE_SOURCES)[number];
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];
export type IndicatorType = 'SMA' | 'EMA' | 'RSI';

export type StrategyOperand =
  { indicator: string } | { price: PriceSource } | { literal: number };

export interface StrategyCondition {
  left: StrategyOperand;
  op: ConditionOperator;
  right: StrategyOperand;
}

export interface StrategyConditionGroup {
  logic: 'AND';
  conditions: StrategyCondition[];
}

export interface StrategyIndicator {
  id: string;
  type: IndicatorType;
  params: { period: number };
  source: PriceSource;
}

export interface PercentRiskRule {
  type: 'percent';
  value: number;
}

/**
 * Canonical MVP strategy definition persisted in strategy_versions.
 *
 * Clients should initialize indicator `source` from the catalog's
 * `default_source`; persisted definitions must include it explicitly.
 */
export interface StrategyDefinition {
  indicators: StrategyIndicator[];
  entry: StrategyConditionGroup;
  exit: StrategyConditionGroup;
  risk: {
    stop_loss: PercentRiskRule;
    take_profit: PercentRiskRule;
  };
}

export interface StrategyDefinitionValidationError {
  path: string;
  code: string;
  message: string;
}

export interface StrategyDefinitionValidationResult {
  is_valid: boolean;
  errors: StrategyDefinitionValidationError[];
}
