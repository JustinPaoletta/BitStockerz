import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes.enum';
import { ERROR_CATALOG } from './error-catalog';
import type { FieldError } from './rfc7807.dto';

/**
 * Base class for domain errors with a stable code and HTTP status.
 * Use this (or subclasses) for consistent API error responses.
 */
export class DomainError extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly statusCode: number = ERROR_CATALOG[code].httpStatus,
    public readonly fieldErrors?: FieldError[],
  ) {
    const detail =
      message ?? ERROR_CATALOG[code].defaultDetail ?? 'An error occurred.';
    super(
      {
        code,
        message: detail,
        statusCode,
        ...(fieldErrors?.length ? { fieldErrors } : {}),
      },
      statusCode,
    );
  }
}
