import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
import type { AiSeverity, AiWarning } from './ai.types';

type Condition = StrategyDefinition['entry']['conditions'][number];

export function runStrategyLogicChecks(
  definition: StrategyDefinition,
): AiWarning[] {
  const warnings: AiWarning[] = [];

  warnings.push(...duplicateConditions(definition.entry.conditions, 'entry'));
  warnings.push(...duplicateConditions(definition.exit.conditions, 'exit'));
  warnings.push(...entryExitConflicts(definition));
  warnings.push(...unreferencedIndicators(definition));
  warnings.push(...unsatisfiableRanges(definition.entry.conditions, 'entry'));
  warnings.push(...unsatisfiableRanges(definition.exit.conditions, 'exit'));
  warnings.push(...riskReward(definition));

  return warnings.slice(0, 10);
}

export function mergeWarnings(
  deterministic: AiWarning[],
  model: AiWarning[],
): AiWarning[] {
  const merged = new Map<string, AiWarning>();

  for (const warning of deterministic) {
    merged.set(dedupeKey(warning), warning);
  }

  for (const warning of model) {
    const key = dedupeKey(warning);
    const existing = merged.get(key);
    if (existing) {
      continue;
    }
    const severity: AiSeverity =
      warning.severity === 'HIGH' ? 'MEDIUM' : warning.severity;
    merged.set(key, {
      ...warning,
      severity,
      evidence_paths: uniqueStrings(warning.evidence_paths).slice(0, 10),
    });
  }

  return [...merged.values()].slice(0, 10);
}

function dedupeKey(warning: AiWarning): string {
  return `${warning.code}|${[...warning.evidence_paths].sort().join(',')}`;
}

function duplicateConditions(
  conditions: Condition[],
  group: 'entry' | 'exit',
): AiWarning[] {
  const seen = new Map<string, number[]>();
  conditions.forEach((condition, index) => {
    const key = canonicalJson(condition);
    const indexes = seen.get(key) ?? [];
    indexes.push(index);
    seen.set(key, indexes);
  });

  const warnings: AiWarning[] = [];
  for (const indexes of seen.values()) {
    if (indexes.length < 2) {
      continue;
    }
    warnings.push({
      code: 'DUPLICATE_CONDITION',
      severity: 'MEDIUM',
      message: `The same condition appears more than once in the ${group} AND group.`,
      evidence_paths: indexes.map((index) => `${group}.conditions[${index}]`),
    });
  }
  return warnings;
}

function entryExitConflicts(definition: StrategyDefinition): AiWarning[] {
  const entryKeys = new Map(
    definition.entry.conditions.map((condition, index) => [
      canonicalJson(condition),
      index,
    ]),
  );
  const warnings: AiWarning[] = [];
  definition.exit.conditions.forEach((condition, exitIndex) => {
    const key = canonicalJson(condition);
    const entryIndex = entryKeys.get(key);
    if (entryIndex === undefined) {
      return;
    }
    warnings.push({
      code: 'ENTRY_EXIT_CONFLICT',
      severity: 'HIGH',
      message: 'Entry and exit rules may conflict for the same bar conditions.',
      evidence_paths: [
        `entry.conditions[${entryIndex}]`,
        `exit.conditions[${exitIndex}]`,
      ],
    });
  });
  return warnings;
}

function unreferencedIndicators(definition: StrategyDefinition): AiWarning[] {
  const referenced = new Set<string>();
  for (const group of [definition.entry, definition.exit]) {
    for (const condition of group.conditions) {
      collectIndicatorRefs(condition.left, referenced);
      collectIndicatorRefs(condition.right, referenced);
    }
  }

  return definition.indicators
    .filter((indicator) => !referenced.has(indicator.id))
    .map((indicator) => ({
      code: 'UNREFERENCED_INDICATOR',
      severity: 'LOW' as const,
      message: `Indicator "${indicator.id}" is declared but unused by entry/exit rules.`,
      evidence_paths: [
        `indicators[${definition.indicators.findIndex((item) => item.id === indicator.id)}]`,
      ],
    }))
    .slice(0, 10);
}

function unsatisfiableRanges(
  conditions: Condition[],
  group: 'entry' | 'exit',
): AiWarning[] {
  const bounds = new Map<
    string,
    {
      lower?: { value: number; inclusive: boolean; index: number };
      upper?: { value: number; inclusive: boolean; index: number };
    }
  >();

  conditions.forEach((condition, index) => {
    const dynamic =
      dynamicOperandKey(condition.left) ?? dynamicOperandKey(condition.right);
    const literal =
      literalValue(condition.right) ?? literalValue(condition.left);
    if (!dynamic || literal === undefined) {
      return;
    }

    const current = bounds.get(dynamic) ?? {};
    if (condition.op === 'gt' || condition.op === 'gte') {
      const inclusive = condition.op === 'gte';
      const candidate = { value: literal, inclusive, index };
      if (
        !current.lower ||
        candidate.value > current.lower.value ||
        (candidate.value === current.lower.value &&
          !candidate.inclusive &&
          current.lower.inclusive)
      ) {
        current.lower = candidate;
      }
    }
    if (condition.op === 'lt' || condition.op === 'lte') {
      const inclusive = condition.op === 'lte';
      const candidate = { value: literal, inclusive, index };
      if (
        !current.upper ||
        candidate.value < current.upper.value ||
        (candidate.value === current.upper.value &&
          !candidate.inclusive &&
          current.upper.inclusive)
      ) {
        current.upper = candidate;
      }
    }
    bounds.set(dynamic, current);
  });

  const warnings: AiWarning[] = [];
  for (const [operand, range] of bounds) {
    if (!range.lower || !range.upper) {
      continue;
    }
    const empty =
      range.lower.value > range.upper.value ||
      (range.lower.value === range.upper.value &&
        !(range.lower.inclusive && range.upper.inclusive));
    if (!empty) {
      continue;
    }
    warnings.push({
      code: 'UNSATISFIABLE_RANGE',
      severity: 'HIGH',
      message: `Conditions on ${operand} form an empty numeric interval.`,
      evidence_paths: [
        `${group}.conditions[${range.lower.index}]`,
        `${group}.conditions[${range.upper.index}]`,
      ],
    });
  }
  return warnings;
}

function riskReward(definition: StrategyDefinition): AiWarning[] {
  const stop = definition.risk.stop_loss.value;
  const take = definition.risk.take_profit.value;
  if (stop < take) {
    return [];
  }
  return [
    {
      code: 'RISK_REWARD_NOT_POSITIVE',
      severity: 'MEDIUM',
      message: 'Stop-loss distance is not smaller than take-profit distance.',
      evidence_paths: ['risk.stop_loss.value', 'risk.take_profit.value'],
    },
  ];
}

function collectIndicatorRefs(
  operand: Condition['left'],
  into: Set<string>,
): void {
  if (operand && typeof operand === 'object' && 'indicator' in operand) {
    into.add(operand.indicator);
  }
}

function dynamicOperandKey(operand: Condition['left']): string | undefined {
  if (!operand || typeof operand !== 'object') {
    return undefined;
  }
  if ('indicator' in operand) {
    return `indicator:${operand.indicator}`;
  }
  if ('price' in operand) {
    return `price:${operand.price}`;
  }
  return undefined;
}

function literalValue(operand: Condition['left']): number | undefined {
  if (operand && typeof operand === 'object' && 'literal' in operand) {
    return typeof operand.literal === 'number' ? operand.literal : undefined;
  }
  return undefined;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    const sorted: Record<string, unknown> = {};
    for (const [key, nested] of entries) {
      sorted[key] = sortKeys(nested);
    }
    return sorted;
  }
  if (typeof value === 'number' && Object.is(value, -0)) {
    return 0;
  }
  return value;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
