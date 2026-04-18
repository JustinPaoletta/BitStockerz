import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import {
  AuthGuard,
  AUTH_TOKEN_REQUEST_KEY,
  AuthenticatedRequest,
  extractBearerToken,
} from './auth.guard';
import type { AuthService } from './auth.service';

describe('extractBearerToken', () => {
  it('extracts token for valid bearer header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('returns undefined for invalid authorization headers', () => {
    expect(extractBearerToken(undefined)).toBeUndefined();
    expect(extractBearerToken('Basic abc123')).toBeUndefined();
    expect(extractBearerToken('Bearer   ')).toBeUndefined();
  });
});

describe('AuthGuard', () => {
  function createExecutionContext(
    request: AuthenticatedRequest,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  it('allows requests with valid bearer token and stamps request context', () => {
    const requireUserBySessionTokenMock = jest.fn();
    const authService = {
      requireUserBySessionToken: requireUserBySessionTokenMock,
    } as unknown as AuthService;

    const guard = new AuthGuard(authService);
    const request = {
      headers: {
        authorization: 'Bearer token-1',
      },
    } as unknown as AuthenticatedRequest;

    const allowed = guard.canActivate(createExecutionContext(request));

    expect(allowed).toBe(true);
    expect(requireUserBySessionTokenMock).toHaveBeenCalledWith('token-1');
    expect(request[AUTH_TOKEN_REQUEST_KEY]).toBe('token-1');
  });

  it('rejects missing bearer token', () => {
    const authService = {
      requireUserBySessionToken: jest.fn(),
    } as unknown as AuthService;

    const guard = new AuthGuard(authService);

    try {
      const request = { headers: {} } as unknown as AuthenticatedRequest;
      guard.canActivate(createExecutionContext(request));
      fail('Expected missing token to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });
});
