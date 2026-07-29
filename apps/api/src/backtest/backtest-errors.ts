import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { BacktestStatus } from './backtests.types';

export function backtestNotFoundError(id: string): DomainError {
  return new DomainError(
    ErrorCode.BACKTEST_NOT_FOUND,
    `Backtest ${id} was not found.`,
  );
}

export function backtestInvalidStateError(
  id: string,
  current: BacktestStatus,
  requested: BacktestStatus,
): DomainError {
  return new DomainError(
    ErrorCode.BACKTEST_INVALID_STATE,
    `Backtest ${id} cannot transition from ${current} to ${requested}.`,
  );
}

export function backtestValidationError(
  field: string,
  reason: string,
): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, reason, 400, [
    { field, reason },
  ]);
}

export function backtestOutputError(message: string): DomainError {
  return new DomainError(ErrorCode.BACKTEST_INVALID_DEFINITION, message);
}
