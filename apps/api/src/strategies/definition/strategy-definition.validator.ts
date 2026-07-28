import {
  INDICATOR_CATALOG,
  type IndicatorCatalogEntry,
} from './indicator-catalog';
import {
  CONDITION_OPERATORS,
  PRICE_SOURCES,
  type StrategyDefinitionValidationError,
  type StrategyDefinitionValidationResult,
} from './strategy-definition.types';

const MAX_INDICATORS = 20;
const MAX_CONDITIONS = 10;
const MAX_INDICATOR_ID_LENGTH = 64;
const STOP_LOSS_MAX_PERCENT = 50;
export const TAKE_PROFIT_MAX_PERCENT = 500;
const INDICATOR_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const DYNAMIC_OPERAND_KEYS = new Set(['indicator', 'price']);
const OPERAND_KEYS = new Set(['indicator', 'price', 'literal']);
const OPERATOR_SET = new Set<string>(CONDITION_OPERATORS);
const PRICE_SOURCE_SET = new Set<string>(PRICE_SOURCES);
const CATALOG_BY_KEY = new Map<string, IndicatorCatalogEntry>(
  INDICATOR_CATALOG.map((entry) => [entry.key, entry]),
);

type JsonObject = Record<string, unknown>;

/**
 * Pure, reusable validator for the canonical MVP strategy-definition contract.
 * Errors follow depth-first JSON property/array order. Missing required fields
 * are appended in canonical schema order after fields present in that object.
 */
export class StrategyDefinitionValidator {
  static validate(definition: unknown): StrategyDefinitionValidationResult {
    const errors: StrategyDefinitionValidationError[] = [];

    if (!isObject(definition)) {
      addError(
        errors,
        '',
        'INVALID_DEFINITION',
        'Definition must be a non-null object.',
      );
      return { is_valid: false, errors };
    }

    const indicatorIds = collectIndicatorIds(definition.indicators);
    validateDefinition(definition, indicatorIds, errors);
    return { is_valid: errors.length === 0, errors };
  }
}

function validateDefinition(
  definition: JsonObject,
  indicatorIds: ReadonlySet<string>,
  errors: StrategyDefinitionValidationError[],
): void {
  const validators: Record<string, (value: unknown) => void> = {
    indicators: (value) => validateIndicators(value, errors),
    entry: (value) =>
      validateConditionGroup(value, 'entry', indicatorIds, errors),
    exit: (value) =>
      validateConditionGroup(value, 'exit', indicatorIds, errors),
    risk: (value) => validateRisk(value, errors),
  };
  validateObjectFields(
    definition,
    '',
    ['indicators', 'entry', 'exit', 'risk'],
    validators,
    errors,
  );
}

function validateIndicators(
  value: unknown,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!Array.isArray(value)) {
    addError(
      errors,
      'indicators',
      'INVALID_TYPE',
      'indicators must be an array.',
    );
    return;
  }
  if (value.length > MAX_INDICATORS) {
    addError(
      errors,
      'indicators',
      'TOO_MANY_INDICATORS',
      `indicators may contain at most ${MAX_INDICATORS} items.`,
    );
  }

  const seenIds = new Set<string>();
  value.forEach((indicator, index) => {
    const path = `indicators[${index}]`;
    if (!isObject(indicator)) {
      addError(
        errors,
        path,
        'INVALID_TYPE',
        'Indicator must be a non-null object.',
      );
      return;
    }

    const catalogEntry =
      typeof indicator.type === 'string'
        ? CATALOG_BY_KEY.get(indicator.type)
        : undefined;
    const validators: Record<string, (field: unknown) => void> = {
      id: (field) => {
        if (
          typeof field !== 'string' ||
          field.length === 0 ||
          field.length > MAX_INDICATOR_ID_LENGTH ||
          !INDICATOR_ID_PATTERN.test(field)
        ) {
          addError(
            errors,
            `${path}.id`,
            'INVALID_INDICATOR_ID',
            `id must be 1–${MAX_INDICATOR_ID_LENGTH} characters and match ${INDICATOR_ID_PATTERN.source}.`,
          );
          return;
        }
        if (seenIds.has(field)) {
          addError(
            errors,
            `${path}.id`,
            'DUPLICATE_INDICATOR_ID',
            `Indicator id "${field}" is duplicated.`,
          );
        }
        seenIds.add(field);
      },
      type: (field) => {
        if (typeof field !== 'string' || !CATALOG_BY_KEY.has(field)) {
          addError(
            errors,
            `${path}.type`,
            'UNKNOWN_INDICATOR',
            'type must be one of SMA, EMA, or RSI.',
          );
        }
      },
      params: (field) =>
        validateIndicatorParams(field, `${path}.params`, catalogEntry, errors),
      source: (field) =>
        validateIndicatorSource(field, `${path}.source`, catalogEntry, errors),
    };
    validateObjectFields(
      indicator,
      path,
      ['id', 'type', 'params', 'source'],
      validators,
      errors,
    );
  });
}

function validateIndicatorParams(
  value: unknown,
  path: string,
  catalogEntry: IndicatorCatalogEntry | undefined,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(errors, path, 'INVALID_TYPE', 'params must be a non-null object.');
    return;
  }

  const periodDefinition = catalogEntry?.params.find(
    (parameter) => parameter.name === 'period',
  );
  validateObjectFields(
    value,
    path,
    ['period'],
    {
      period: (period) => {
        if (!Number.isInteger(period)) {
          addError(
            errors,
            `${path}.period`,
            'INVALID_PARAMETER',
            'period must be a finite integer.',
          );
          return;
        }
        if (
          periodDefinition &&
          ((period as number) < periodDefinition.min ||
            (period as number) > periodDefinition.max)
        ) {
          addError(
            errors,
            `${path}.period`,
            'PARAMETER_OUT_OF_RANGE',
            `period must be between ${periodDefinition.min} and ${periodDefinition.max}.`,
          );
        }
      },
    },
    errors,
  );
}

function validateIndicatorSource(
  value: unknown,
  path: string,
  catalogEntry: IndicatorCatalogEntry | undefined,
  errors: StrategyDefinitionValidationError[],
): void {
  if (typeof value !== 'string' || !PRICE_SOURCE_SET.has(value)) {
    addError(
      errors,
      path,
      'INVALID_SOURCE',
      'source must be one of open, high, low, or close.',
    );
    return;
  }
  if (
    catalogEntry &&
    !catalogEntry.sources.some((source) => source === value)
  ) {
    addError(
      errors,
      path,
      'INVALID_SOURCE',
      `${catalogEntry.key} supports source ${catalogEntry.sources.join(', ')}.`,
    );
  }
}

function validateConditionGroup(
  value: unknown,
  path: 'entry' | 'exit',
  indicatorIds: ReadonlySet<string>,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(
      errors,
      path,
      'INVALID_TYPE',
      `${path} must be a non-null object.`,
    );
    return;
  }

  validateObjectFields(
    value,
    path,
    ['logic', 'conditions'],
    {
      logic: (logic) => {
        if (logic !== 'AND') {
          addError(
            errors,
            `${path}.logic`,
            'OR_NOT_SUPPORTED',
            'logic must be AND.',
          );
        }
      },
      conditions: (conditions) =>
        validateConditions(conditions, path, indicatorIds, errors),
    },
    errors,
  );
}

function validateConditions(
  value: unknown,
  groupPath: 'entry' | 'exit',
  indicatorIds: ReadonlySet<string>,
  errors: StrategyDefinitionValidationError[],
): void {
  const path = `${groupPath}.conditions`;
  if (!Array.isArray(value)) {
    addError(errors, path, 'INVALID_TYPE', 'conditions must be an array.');
    return;
  }
  if (value.length === 0) {
    addError(
      errors,
      path,
      'EMPTY_CONDITIONS',
      'conditions must contain at least one item.',
    );
  }
  if (value.length > MAX_CONDITIONS) {
    addError(
      errors,
      path,
      'TOO_MANY_CONDITIONS',
      `conditions may contain at most ${MAX_CONDITIONS} items.`,
    );
  }
  value.forEach((condition, index) =>
    validateCondition(condition, `${path}[${index}]`, indicatorIds, errors),
  );
}

function validateCondition(
  value: unknown,
  path: string,
  indicatorIds: ReadonlySet<string>,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(
      errors,
      path,
      'INVALID_TYPE',
      'Condition must be a non-null object.',
    );
    return;
  }

  validateObjectFields(
    value,
    path,
    ['left', 'op', 'right'],
    {
      left: (operand) =>
        validateOperand(operand, `${path}.left`, indicatorIds, errors),
      op: (operator) => {
        if (typeof operator !== 'string' || !OPERATOR_SET.has(operator)) {
          addError(
            errors,
            `${path}.op`,
            'UNKNOWN_OPERATOR',
            `op must be one of ${CONDITION_OPERATORS.join(', ')}.`,
          );
        }
      },
      right: (operand) =>
        validateOperand(operand, `${path}.right`, indicatorIds, errors),
    },
    errors,
  );

  if (
    (value.op === 'crosses_above' || value.op === 'crosses_below') &&
    !isDynamicOperand(value.left) &&
    !isDynamicOperand(value.right)
  ) {
    addError(
      errors,
      `${path}.op`,
      'CROSS_REQUIRES_DYNAMIC_OPERAND',
      'A crossover requires at least one indicator or price operand.',
    );
  }
}

function validateOperand(
  value: unknown,
  path: string,
  indicatorIds: ReadonlySet<string>,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(
      errors,
      path,
      'INVALID_OPERAND',
      'Operand must be an object with exactly one of indicator, price, or literal.',
    );
    return;
  }

  const recognizedKeys = Object.keys(value).filter((key) =>
    OPERAND_KEYS.has(key),
  );
  for (const key of Object.keys(value)) {
    if (!OPERAND_KEYS.has(key)) {
      addError(
        errors,
        joinPath(path, key),
        'UNKNOWN_KEY',
        `Unknown field "${key}".`,
      );
      continue;
    }
    const field = value[key];
    if (key === 'indicator') {
      if (typeof field !== 'string' || !indicatorIds.has(field)) {
        addError(
          errors,
          `${path}.indicator`,
          'UNKNOWN_INDICATOR_REFERENCE',
          `indicator must reference an id declared in indicators.`,
        );
      }
    } else if (key === 'price') {
      if (typeof field !== 'string' || !PRICE_SOURCE_SET.has(field)) {
        addError(
          errors,
          `${path}.price`,
          'INVALID_PRICE_SOURCE',
          'price must be one of open, high, low, or close.',
        );
      }
    } else if (typeof field !== 'number' || !Number.isFinite(field)) {
      addError(
        errors,
        `${path}.literal`,
        'INVALID_LITERAL',
        'literal must be a finite number.',
      );
    }
  }
  if (recognizedKeys.length !== 1) {
    addError(
      errors,
      path,
      'INVALID_OPERAND',
      'Operand must contain exactly one of indicator, price, or literal.',
    );
  }
}

function validateRisk(
  value: unknown,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(errors, 'risk', 'INVALID_TYPE', 'risk must be a non-null object.');
    return;
  }
  validateObjectFields(
    value,
    'risk',
    ['stop_loss', 'take_profit'],
    {
      stop_loss: (rule) =>
        validateRiskRule(rule, 'risk.stop_loss', STOP_LOSS_MAX_PERCENT, errors),
      take_profit: (rule) =>
        validateRiskRule(
          rule,
          'risk.take_profit',
          TAKE_PROFIT_MAX_PERCENT,
          errors,
        ),
    },
    errors,
  );
}

function validateRiskRule(
  value: unknown,
  path: string,
  max: number,
  errors: StrategyDefinitionValidationError[],
): void {
  if (!isObject(value)) {
    addError(
      errors,
      path,
      'INVALID_TYPE',
      `${path.split('.').at(-1)} must be a non-null object.`,
    );
    return;
  }
  validateObjectFields(
    value,
    path,
    ['type', 'value'],
    {
      type: (type) => {
        if (type !== 'percent') {
          addError(
            errors,
            `${path}.type`,
            'INVALID_RISK_TYPE',
            'type must be percent.',
          );
        }
      },
      value: (amount) => {
        if (
          typeof amount !== 'number' ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          amount > max
        ) {
          addError(
            errors,
            `${path}.value`,
            'RISK_VALUE_OUT_OF_RANGE',
            `value must be greater than 0 and at most ${max}.`,
          );
        }
      },
    },
    errors,
  );
}

function validateObjectFields(
  value: JsonObject,
  path: string,
  requiredKeys: readonly string[],
  validators: Record<string, (field: unknown) => void>,
  errors: StrategyDefinitionValidationError[],
): void {
  const allowed = new Set(requiredKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addError(
        errors,
        joinPath(path, key),
        'UNKNOWN_KEY',
        `Unknown field "${key}".`,
      );
      continue;
    }
    validators[key]?.(value[key]);
  }
  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      addError(
        errors,
        joinPath(path, key),
        'REQUIRED_FIELD',
        `${key} is required.`,
      );
    }
  }
}

function collectIndicatorIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    return ids;
  }
  for (const indicator of value) {
    if (isObject(indicator) && typeof indicator.id === 'string') {
      ids.add(indicator.id);
    }
  }
  return ids;
}

function isDynamicOperand(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }
  return Object.keys(value).some((key) => DYNAMIC_OPERAND_KEYS.has(key));
}

function isObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return (
    Reflect.getPrototypeOf(value) === null ||
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

function addError(
  errors: StrategyDefinitionValidationError[],
  path: string,
  code: string,
  message: string,
): void {
  errors.push({ path, code, message });
}
