import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

function createConfig(overrides?: Partial<AppConfigService['auth']>): AppConfigService {
  return {
    auth: {
      sessionTtlSeconds: 3600,
      challengeTtlSeconds: 300,
      oauthStateTtlSeconds: 300,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 2,
      webauthnRpId: 'localhost',
      webauthnRpName: 'BitStockerz',
      ...overrides,
    },
  } as AppConfigService;
}

function createExecutionContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthRateLimitGuard', () => {
  it('allows requests under the configured limit', () => {
    const guard = new AuthRateLimitGuard(createConfig({ rateLimitMaxRequests: 3 }));
    const request = {
      path: '/api/auth/webauthn/register/options',
      ip: '127.0.0.1',
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('throws RATE_LIMITED when request count exceeds the limit', () => {
    const guard = new AuthRateLimitGuard(createConfig({ rateLimitMaxRequests: 1 }));
    const request = {
      path: '/api/auth/webauthn/register/options',
      ip: '127.0.0.1',
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);

    try {
      guard.canActivate(createExecutionContext(request));
      fail('Expected request to be rate limited');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.RATE_LIMITED);
    }
  });

  it('resets allowance once the window has elapsed', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-20T00:00:00.000Z'));

    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 1, rateLimitWindowMs: 1000 }),
    );
    const request = {
      path: '/api/auth/oauth/google/start',
      ip: '127.0.0.1',
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(DomainError);

    jest.advanceTimersByTime(1001);

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);

    jest.useRealTimers();
  });
});
