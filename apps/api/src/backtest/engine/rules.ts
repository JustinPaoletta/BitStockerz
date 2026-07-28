import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type {
  StrategyCondition,
  StrategyConditionGroup,
  StrategyOperand,
} from '../../strategies/definition/strategy-definition.types';
import type { EngineBar } from './backtest-engine.types';
import type { IndicatorSeries } from './indicators';

const EQUALITY_EPSILON = 1e-9;

export interface RuleEvaluationContext {
  bars: readonly EngineBar[];
  indicators: IndicatorSeries;
  index: number;
}

export function evaluateRules(
  group: StrategyConditionGroup,
  context: RuleEvaluationContext,
): boolean {
  if (group?.logic !== 'AND' || !Array.isArray(group.conditions)) {
    throw invalidDefinition(
      'Rule groups must use AND with a conditions array.',
    );
  }
  if (group.conditions.length === 0) {
    throw invalidDefinition('Rule groups must contain at least one condition.');
  }
  return group.conditions.every((condition) =>
    evaluateCondition(condition, context),
  );
}

export function evaluateCondition(
  condition: StrategyCondition,
  context: RuleEvaluationContext,
): boolean {
  const left = resolveOperand(condition?.left, context, context.index);
  const right = resolveOperand(condition?.right, context, context.index);

  switch (condition?.op) {
    case 'gt':
      return left !== null && right !== null && left > right;
    case 'gte':
      return left !== null && right !== null && left >= right;
    case 'lt':
      return left !== null && right !== null && left < right;
    case 'lte':
      return left !== null && right !== null && left <= right;
    case 'eq':
      return (
        left !== null &&
        right !== null &&
        Math.abs(left - right) <=
          EQUALITY_EPSILON * Math.max(1, Math.abs(left), Math.abs(right))
      );
    case 'crosses_above':
    case 'crosses_below': {
      if (!isDynamic(condition.left) && !isDynamic(condition.right)) {
        throw invalidDefinition(
          'A crossover requires at least one dynamic operand.',
        );
      }
      if (context.index === 0 || left === null || right === null) {
        return false;
      }
      const previousLeft = resolveOperand(
        condition.left,
        context,
        context.index - 1,
      );
      const previousRight = resolveOperand(
        condition.right,
        context,
        context.index - 1,
      );
      if (previousLeft === null || previousRight === null) {
        return false;
      }
      return condition.op === 'crosses_above'
        ? previousLeft <= previousRight && left > right
        : previousLeft >= previousRight && left < right;
    }
    default:
      throw invalidDefinition(
        `Unknown condition operator "${String(condition?.op)}".`,
      );
  }
}

function resolveOperand(
  operand: StrategyOperand,
  context: RuleEvaluationContext,
  index: number,
): number | null {
  if (!operand || typeof operand !== 'object' || Array.isArray(operand)) {
    throw invalidDefinition('Rule operands must be objects.');
  }

  if ('literal' in operand) {
    if (
      typeof operand.literal !== 'number' ||
      !Number.isFinite(operand.literal)
    ) {
      throw invalidDefinition('Literal operands must be finite numbers.');
    }
    return operand.literal;
  }

  if ('price' in operand) {
    const bar = context.bars[index];
    const value = bar?.[operand.price];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalidDefinition(
        `Price source "${String(operand.price)}" is unavailable.`,
      );
    }
    return value;
  }

  if ('indicator' in operand) {
    if (
      typeof operand.indicator !== 'string' ||
      !Object.hasOwn(context.indicators, operand.indicator)
    ) {
      throw invalidDefinition(
        `Indicator "${String(operand.indicator)}" is unavailable.`,
      );
    }
    const value = context.indicators[operand.indicator][index];
    if (value !== null && !Number.isFinite(value)) {
      throw invalidDefinition(
        `Indicator "${operand.indicator}" produced a non-finite value.`,
      );
    }
    return value;
  }

  throw invalidDefinition('Unknown rule operand.');
}

function isDynamic(operand: StrategyOperand): boolean {
  return (
    Boolean(operand) &&
    typeof operand === 'object' &&
    ('indicator' in operand || 'price' in operand)
  );
}

function invalidDefinition(message: string): DomainError {
  return new DomainError(ErrorCode.BACKTEST_INVALID_DEFINITION, message);
}
