import type {
  ConditionOperator,
  StrategyCondition,
  StrategyDefinition,
  StrategyIndicator,
  StrategyOperand,
} from './strategy-definition.types';

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  eq: '=',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

/**
 * Produces the stable, non-AI summary exposed by the Strategy Lab API.
 * Callers must validate the definition before invoking this function.
 */
export function summarizeStrategyDefinition(
  definition: StrategyDefinition,
): string {
  const indicators = new Map(
    definition.indicators.map((indicator) => [indicator.id, indicator]),
  );
  const entry = definition.entry.conditions
    .map((condition) => summarizeCondition(condition, indicators))
    .join(' AND ');
  const exit = definition.exit.conditions
    .map((condition) => summarizeCondition(condition, indicators))
    .join(' AND ');

  return [
    `Buy when ${entry}.`,
    `Exit when ${exit}.`,
    `Stop loss ${formatNumber(definition.risk.stop_loss.value)}%.`,
    `Take profit ${formatNumber(definition.risk.take_profit.value)}%.`,
  ].join(' ');
}

function summarizeCondition(
  condition: StrategyCondition,
  indicators: ReadonlyMap<string, StrategyIndicator>,
): string {
  return `${summarizeOperand(condition.left, indicators)} ${
    OPERATOR_LABELS[condition.op]
  } ${summarizeOperand(condition.right, indicators)}`;
}

function summarizeOperand(
  operand: StrategyOperand,
  indicators: ReadonlyMap<string, StrategyIndicator>,
): string {
  if ('indicator' in operand) {
    const indicator = indicators.get(operand.indicator);
    return indicator
      ? `${indicator.type}(${formatNumber(indicator.params.period)})`
      : operand.indicator;
  }
  if ('price' in operand) {
    return `${operand.price} price`;
  }
  return formatNumber(operand.literal);
}

function formatNumber(value: number): string {
  return String(value);
}
