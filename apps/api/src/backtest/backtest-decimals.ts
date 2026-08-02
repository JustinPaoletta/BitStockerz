import { Prisma } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';

export function toPersistedDecimal(
  value: number,
  precision: number,
  scale: number,
  field: string,
  options: { positive?: boolean; nonNegative?: boolean } = {},
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw decimalError(field);
  }

  const decimal = new Prisma.Decimal(value);
  const rounded = decimal.toDecimalPlaces(scale, Prisma.Decimal.ROUND_HALF_UP);
  const integerDigits = precision - scale;
  const exclusiveLimit = new Prisma.Decimal(`1${'0'.repeat(integerDigits)}`);
  if (!rounded.isFinite() || rounded.abs().gte(exclusiveLimit)) {
    throw decimalError(field);
  }
  if (options.positive && rounded.lte(0)) {
    throw decimalError(field);
  }
  if (options.nonNegative && rounded.lt(0)) {
    throw decimalError(field);
  }
  return rounded.toFixed(scale);
}

function decimalError(field: string): DomainError {
  return new DomainError(
    ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    `Backtest value ${field} cannot be stored at the configured precision.`,
  );
}
