import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
import { StrategyDefinitionValidator } from '../strategies/definition/strategy-definition.validator';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
export interface SuggestionChange {
  path: string;
  before: number;
  after: number;
  rationale: string;
}
/** Parameter-only previews; no generic patch interpreter and no database writes. */
export function validateSuggestionChanges(
  definition: StrategyDefinition,
  changes: SuggestionChange[],
): SuggestionChange[] {
  const draft = structuredClone(definition);
  const seen = new Set<string>();
  for (const change of changes) {
    if (
      seen.has(change.path) ||
      !Number.isFinite(change.before) ||
      !Number.isFinite(change.after) ||
      change.before === change.after
    )
      invalid();
    seen.add(change.path);
    const match = /^indicators\[(\d+)\]\.params\.period$/.exec(change.path);
    if (match) {
      const indicator = draft.indicators[Number(match[1])];
      if (!indicator || indicator.params.period !== change.before) invalid();
      indicator.params.period = change.after;
    } else if (
      change.path === 'risk.stop_loss.value' ||
      change.path === 'risk.take_profit.value'
    ) {
      const risk =
        change.path === 'risk.stop_loss.value'
          ? draft.risk.stop_loss
          : draft.risk.take_profit;
      if (risk.value !== change.before) invalid();
      risk.value = change.after;
    } else invalid();
  }
  if (!StrategyDefinitionValidator.validate(draft).is_valid) invalid();
  return changes.map((change) => ({ ...change }));
}
function invalid(): never {
  throw new DomainError(
    ErrorCode.AI_PROVIDER_ERROR,
    'Kernel returned an invalid change preview.',
  );
}
