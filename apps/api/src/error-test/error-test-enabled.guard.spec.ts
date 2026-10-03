import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import { ErrorTestEnabledGuard } from './error-test-enabled.guard';

describe('ErrorTestEnabledGuard', () => {
  it('allows requests when error-test routes are enabled', () => {
    const guard = new ErrorTestEnabledGuard({
      server: { errorTestEnabled: true },
    } as AppConfigService);

    expect(guard.canActivate()).toBe(true);
  });

  it('blocks requests when error-test routes are not configured', () => {
    const guard = new ErrorTestEnabledGuard({
      server: {},
    } as AppConfigService);

    expect(() => guard.canActivate()).toThrow(DomainError);
  });

  it('blocks requests when error-test routes are disabled', () => {
    const guard = new ErrorTestEnabledGuard({
      server: { errorTestEnabled: false },
    } as AppConfigService);

    expect(() => guard.canActivate()).toThrow(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND }),
    );
    try {
      guard.canActivate();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
    }
  });
});
