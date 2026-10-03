import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';

export interface ContextBudgetResult<T> {
  payload: T;
  context_truncated: boolean;
  json: string;
}

/**
 * Fit a deterministic payload under a character budget by omitting optional
 * fields in priority order. Never byte-slices JSON.
 */
export function fitContextBudget<T extends Record<string, unknown>>(
  payload: T,
  maxChars: number,
  omitPriority: (keyof T)[],
): ContextBudgetResult<T> {
  let working: Record<string, unknown> = { ...payload };
  let json = JSON.stringify(working);

  if (json.length <= maxChars) {
    return { payload: working as T, context_truncated: false, json };
  }

  for (const key of omitPriority) {
    if (!(key in working)) {
      continue;
    }
    const next = { ...working };
    delete next[key as string];
    working = next;
    json = JSON.stringify(working);
    if (json.length <= maxChars) {
      return {
        payload: { ...(working as T), context_truncated: true },
        context_truncated: true,
        json: JSON.stringify({ ...working, context_truncated: true }),
      };
    }
  }

  throw new DomainError(
    ErrorCode.VALIDATION_ERROR,
    `AI context exceeds AI_MAX_CONTEXT_CHARS (${maxChars}) even after truncation.`,
  );
}
