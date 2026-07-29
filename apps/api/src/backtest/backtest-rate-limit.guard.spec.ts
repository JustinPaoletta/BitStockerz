import type { ExecutionContext } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import type { AppConfigService } from '../config/app-config.service';
import type { AuthService } from '../auth/auth.service';
import { AUTH_TOKEN_REQUEST_KEY } from '../auth/auth.guard';
import { BacktestRateLimitGuard } from './backtest-rate-limit.guard';

function context(token?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ [AUTH_TOKEN_REQUEST_KEY]: token }),
    }),
  } as unknown as ExecutionContext;
}

describe('BacktestRateLimitGuard', () => {
  const config = {
    backtest: { rateLimitWindowMs: 1000, rateLimitMaxRequests: 1 },
  } as AppConfigService;
  const auth = {
    requireUserBySessionToken: jest.fn(() => ({ id: 'user-1' })),
  } as unknown as AuthService;

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('requires the authenticated token established by AuthGuard', () => {
    const guard = new BacktestRateLimitGuard(config, auth);
    expect(() => guard.canActivate(context())).toThrow(DomainError);
  });

  it('limits each user within the configured sliding window', () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const guard = new BacktestRateLimitGuard(config, auth);
    expect(guard.canActivate(context('token'))).toBe(true);
    expect(() => guard.canActivate(context('token'))).toThrow(DomainError);
    jest.advanceTimersByTime(1001);
    expect(guard.canActivate(context('token'))).toBe(true);
  });
});
