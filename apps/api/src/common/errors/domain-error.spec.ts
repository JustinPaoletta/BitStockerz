import { ErrorCode } from './error-codes.enum';
import { ERROR_CATALOG } from './error-catalog';
import { DomainError } from './domain-error';

describe('DomainError', () => {
  it('uses the provided message when supplied', () => {
    const error = new DomainError(ErrorCode.FORBIDDEN, 'Custom message');
    const response = error.getResponse() as { message?: string; code?: string; statusCode?: number };
    expect(response.message).toBe('Custom message');
    expect(response.code).toBe('FORBIDDEN');
    expect(response.statusCode).toBe(403);
  });

  it('uses catalog default detail when message is omitted', () => {
    const error = new DomainError(ErrorCode.UNAUTHORIZED);
    const response = error.getResponse() as { message?: string };
    expect(response.message).toBe(ERROR_CATALOG[ErrorCode.UNAUTHORIZED].defaultDetail);
  });

  it('falls back to generic detail when catalog default is missing', () => {
    const originalDetail = ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail;
    ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail = undefined;
    try {
      const error = new DomainError(ErrorCode.FORBIDDEN);
      const response = error.getResponse() as { message?: string };
      expect(response.message).toBe('An error occurred.');
    } finally {
      ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail = originalDetail;
    }
  });
});
