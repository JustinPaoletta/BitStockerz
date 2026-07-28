import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';

const CHECK_INTERVAL_MASK = 63;

export interface ExecutionBudget {
  readonly signal?: AbortSignal;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly now: () => number;
}

export function createExecutionBudget(
  timeoutMs: number,
  signal?: AbortSignal,
  now: () => number = () => performance.now(),
): ExecutionBudget {
  const startedAtMs = now();
  return {
    signal,
    startedAtMs,
    deadlineMs: startedAtMs + timeoutMs,
    now,
  };
}

export function checkBudget(
  budget: ExecutionBudget | undefined,
  iteration = 0,
  force = false,
): void {
  if (!budget || (!force && (iteration & CHECK_INTERVAL_MASK) !== 0)) {
    return;
  }

  if (budget.signal?.aborted || budget.now() >= budget.deadlineMs) {
    throw new DomainError(
      ErrorCode.BACKTEST_TIMEOUT,
      'The backtest exceeded its execution deadline.',
    );
  }
}

export function elapsedBudgetMs(budget: ExecutionBudget): number {
  return Math.max(0, budget.now() - budget.startedAtMs);
}
