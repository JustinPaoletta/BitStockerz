import { isISO8601 } from 'class-validator';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_WITH_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isValidDateOnly(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DATE_ONLY_PATTERN.test(value) &&
    isISO8601(value, { strict: true, strictSeparator: true })
  );
}

export function isValidIsoDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    ISO_DATETIME_WITH_ZONE_PATTERN.test(value) &&
    isISO8601(value, { strict: true, strictSeparator: true }) &&
    Number.isFinite(Date.parse(value))
  );
}
