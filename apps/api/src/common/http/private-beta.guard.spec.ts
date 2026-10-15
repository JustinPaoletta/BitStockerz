import type { ExecutionContext } from '@nestjs/common';
import {
  AppConfigService,
  loadAppConfig,
} from '../../config/app-config.service';
import {
  PrivateBetaGuard,
  PRIVATE_BETA_HEADER,
  PRIVATE_BETA_MONITOR_HEADER,
} from './private-beta.guard';

const key = 'a'.repeat(64);
const config = (env: NodeJS.ProcessEnv) =>
  ({ server: loadAppConfig(env).server }) as AppConfigService;
const context = (
  path = '/api/symbols',
  value?: string | string[],
  method = 'GET',
  header = PRIVATE_BETA_HEADER,
) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        path,
        method,
        headers: { [header]: value },
      }),
    }),
  }) as ExecutionContext;

describe('private beta access', () => {
  it('limits the separate monitoring key to the market-data health GET endpoint', () => {
    const monitor = 'c'.repeat(64);
    const protectedGuard = new PrivateBetaGuard(
      config({
        PRIVATE_BETA_ENABLED: 'true',
        PRIVATE_BETA_PROXY_KEY: key,
        PRIVATE_BETA_MONITOR_KEY: monitor,
      }),
    );
    expect(
      protectedGuard.canActivate(
        context(
          '/api/market-data/health',
          monitor,
          'GET',
          PRIVATE_BETA_MONITOR_HEADER,
        ),
      ),
    ).toBe(true);
    for (const path of ['/api/symbols', '/api/auth/providers'])
      expect(() =>
        protectedGuard.canActivate(
          context(path, monitor, 'GET', PRIVATE_BETA_MONITOR_HEADER),
        ),
      ).toThrow();
    expect(() =>
      protectedGuard.canActivate(
        context(
          '/api/market-data/health',
          monitor,
          'POST',
          PRIVATE_BETA_MONITOR_HEADER,
        ),
      ),
    ).toThrow();
    expect(() => loadAppConfig({ PRIVATE_BETA_MONITOR_KEY: 'short' })).toThrow(
      'PRIVATE_BETA_MONITOR_KEY',
    );
  });
  it('requires a valid server secret without including it in validation errors', () => {
    expect(() => loadAppConfig({ PRIVATE_BETA_ENABLED: 'true' })).toThrow(
      'PRIVATE_BETA_PROXY_KEY',
    );
    expect(() =>
      loadAppConfig({
        PRIVATE_BETA_ENABLED: 'true',
        PRIVATE_BETA_PROXY_KEY: 'sensitive',
      }),
    ).toThrow('32-byte hexadecimal');
    expect(loadAppConfig({}).server.privateBetaEnabled).toBe(false);
  });
  it('allows the existing public behavior only when beta protection is disabled', () => {
    expect(new PrivateBetaGuard(config({})).canActivate(context())).toBe(true);
  });
  const guard = new PrivateBetaGuard(
    config({ PRIVATE_BETA_ENABLED: 'true', PRIVATE_BETA_PROXY_KEY: key }),
  );
  it('rejects missing, incorrect and duplicate keys across data and signup endpoints', () => {
    for (const path of [
      '/api',
      '/api/symbols',
      '/api/auth/providers',
      '/api/auth/webauthn/register/options',
      '/api/metrics',
      '/api/health/live/other',
    ]) {
      for (const received of [undefined, 'short', 'b'.repeat(64), [key, key]]) {
        expect(() => guard.canActivate(context(path, received))).toThrow();
      }
      expect(guard.canActivate(context(path, key))).toBe(true);
    }
  });
  it('allows only read-only health probes without a key', () => {
    for (const path of ['/api/health/live', '/api/health/ready/']) {
      expect(guard.canActivate(context(path))).toBe(true);
      expect(guard.canActivate(context(path, undefined, 'HEAD'))).toBe(true);
      expect(() =>
        guard.canActivate(context(path, undefined, 'POST')),
      ).toThrow();
    }
  });
  it('fails closed if a constructed config has lost its secret', () => {
    expect(() =>
      new PrivateBetaGuard({
        server: { privateBetaEnabled: true },
      } as AppConfigService).canActivate(context('/api/symbols', key)),
    ).toThrow();
  });
});
