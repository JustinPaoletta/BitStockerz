import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import type { AuthenticatedRequest } from './auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

function createConfig(
  overrides?: Partial<AppConfigService['auth']>,
): AppConfigService {
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

function createExecutionContext(
  request: AuthenticatedRequest,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthRateLimitGuard', () => {
  it('allows requests under the configured limit', () => {
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 3 }),
    );
    const request = {
      path: '/api/auth/webauthn/register/options',
      ip: '127.0.0.1',
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('throws RATE_LIMITED when request count exceeds the limit', () => {
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 1 }),
    );
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

  it('uses route path and socket address fallbacks when building rate-limit keys', () => {
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 3 }),
    );
    const request = {
      route: { path: '/api/auth/oauth/apple/start' },
      socket: { remoteAddress: '10.0.0.5' },
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
  });

  it('falls back to request path and unknown ip when route and ip are missing', () => {
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 3 }),
    );
    const request = {
      path: '/api/auth/login',
      socket: {},
    } as AuthenticatedRequest;

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);
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
    expect(() => guard.canActivate(createExecutionContext(request))).toThrow(
      DomainError,
    );

    jest.advanceTimersByTime(1001);

    expect(guard.canActivate(createExecutionContext(request))).toBe(true);

    jest.useRealTimers();
  });
});

describe('auth limiter resource bounds', () => {
  afterEach(() => jest.useRealTimers());
  it('releases inactive client buckets after the window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(100_000);
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitWindowMs: 1000 }),
    );
    const first = {
      path: '/api/auth/login',
      ip: '198.51.100.1',
    } as AuthenticatedRequest;
    guard.canActivate(createExecutionContext(first));
    jest.advanceTimersByTime(1001);
    guard.canActivate(
      createExecutionContext({
        ...first,
        ip: '198.51.100.2',
      } as AuthenticatedRequest),
    );
    expect(guard['buckets'].size).toBe(1);
  });
  it('bounds distinct active clients without resetting their allowance', () => {
    jest.useFakeTimers();
    jest.setSystemTime(100_000);
    const guard = new AuthRateLimitGuard(
      createConfig({ rateLimitMaxRequests: 1 }),
    );
    for (let i = 0; i < 10_000; i++)
      guard['buckets'].set(`/api/auth/login:client-${i}`, {
        timestamps: [Date.now()],
      });
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          path: '/api/auth/login',
          ip: 'new-client',
        } as AuthenticatedRequest),
      ),
    ).toThrow(DomainError);
    expect(guard['buckets'].size).toBe(10_000);
    expect(() =>
      guard.canActivate(
        createExecutionContext({
          path: '/api/auth/login',
          ip: 'client-0',
        } as AuthenticatedRequest),
      ),
    ).toThrow(DomainError);
  });
});
