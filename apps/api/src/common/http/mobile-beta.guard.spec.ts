import type { ExecutionContext } from '@nestjs/common';
import type { AppConfigService } from '../../config/app-config.service';
import type { MobileAdmissionService } from '../../auth/mobile-admission.service';
import { PrivateBetaGuard } from './private-beta.guard';

function context(
  method: string,
  path: string,
  headers: Record<string, unknown> = {},
) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, path, headers }) }),
  } as ExecutionContext;
}
const config = {
  server: {
    privateBetaEnabled: true,
    privateBetaMobileEnabled: true,
    privateBetaProxyKey: 'c'.repeat(64),
  },
} as AppConfigService;

describe('direct mobile API perimeter', () => {
  const mobile = {
    enabled: true,
    requireSession: jest.fn(async (token?: string) => {
      if (!token) throw new Error('unauthorized');
    }),
  };
  const guard = new PrivateBetaGuard(
    config,
    mobile as unknown as MobileAdmissionService,
  );
  beforeEach(() => mobile.requireSession.mockClear());

  it('opens only the four rate-limited passkey bootstrap POST routes', () => {
    for (const intent of ['login', 'register'])
      for (const phase of ['options', 'verify']) {
        expect(
          guard.canActivate(
            context('POST', `/api/auth/webauthn/${intent}/${phase}`),
          ),
        ).toBe(true);
        expect(() =>
          guard.canActivate(
            context('GET', `/api/auth/webauthn/${intent}/${phase}`),
          ),
        ).toThrow();
      }
    expect(mobile.requireSession).not.toHaveBeenCalled();
  });

  it('requires live DB session/admission even for otherwise unguarded market metadata', async () => {
    for (const path of [
      '/api/symbols/search',
      '/api/strategies/indicators',
      '/api/market-data/equities/candles',
      '/api/me',
      '/api/workspace/account-export',
    ]) {
      await expect(guard.canActivate(context('GET', path))).rejects.toThrow();
      await expect(
        guard.canActivate(
          context('GET', path, { authorization: 'Bearer valid-session' }),
        ),
      ).resolves.toBe(true);
    }
    expect(mobile.requireSession).toHaveBeenCalledWith('valid-session');
    mobile.requireSession.mockRejectedValueOnce(new Error('revoked'));
    await expect(
      guard.canActivate(
        context('GET', '/api/me', { authorization: 'Bearer valid-session' }),
      ),
    ).rejects.toThrow('revoked');
  });

  it('does not let a valid old proxy key bypass revoked admission on user routes', async () => {
    mobile.requireSession.mockRejectedValueOnce(new Error('revoked'));
    await expect(
      guard.canActivate(
        context('GET', '/api/me', {
          authorization: 'Bearer cached-session',
          'x-bitstockerz-beta-key': 'c'.repeat(64),
        }),
      ),
    ).rejects.toThrow('revoked');
  });

  it('matches Express case-insensitive routes and HEAD fallback before honoring a proxy key', async () => {
    for (const [method, path] of [
      ['GET', '/api/ME'],
      ['HEAD', '/API/Me'],
      ['HEAD', '/api/WORKSPACE/account-export'],
    ]) {
      mobile.requireSession.mockRejectedValueOnce(new Error('revoked'));
      await expect(
        guard.canActivate(
          context(method, path, {
            authorization: 'Bearer cached-session',
            'x-bitstockerz-beta-key': 'c'.repeat(64),
          }),
        ),
      ).rejects.toThrow('revoked');
    }
    expect(
      guard.canActivate(context('POST', '/API/AUTH/WebAuthn/Register/Options')),
    ).toBe(true);
  });

  it('preserves owned account deletion and security controls after admission', async () => {
    for (const [method, path] of [
      ['DELETE', '/api/workspace/account'],
      ['DELETE', '/api/me/security/sessions/session-id'],
      ['POST', '/api/me/security/passkeys/verify'],
      ['POST', '/api/ai/explain-backtest'],
    ])
      await expect(
        guard.canActivate(
          context(method, path, { authorization: 'Bearer valid-session' }),
        ),
      ).resolves.toBe(true);
  });

  it('denies operator, OAuth, email shortcuts, unknown routes and wrong methods even with a bearer', () => {
    for (const [method, path] of [
      ['GET', '/api/metrics'],
      ['POST', '/api/jobs'],
      ['GET', '/api/jobs/job-id'],
      ['POST', '/api/market-data/ingestion/equity'],
      ['GET', '/api/error-test/forced'],
      ['POST', '/api/auth/register'],
      ['POST', '/api/auth/login'],
      ['GET', '/api/auth/providers'],
      ['POST', '/api/auth/oauth/google/browser/start'],
      ['GET', '/api/unknown'],
      ['POST', '/api/symbols/search'],
    ])
      expect(() =>
        guard.canActivate(
          context(method, path, { authorization: 'Bearer valid-session' }),
        ),
      ).toThrow();
    expect(mobile.requireSession).not.toHaveBeenCalled();
  });

  it('retains legacy server-proxy protection and fails closed without its mobile service', () => {
    expect(
      guard.canActivate(
        context('GET', '/api/auth/providers', {
          'x-bitstockerz-beta-key': 'c'.repeat(64),
        }),
      ),
    ).toBe(true);
    const disabled = new PrivateBetaGuard(
      {
        server: { ...config.server, privateBetaMobileEnabled: false },
      } as AppConfigService,
      mobile as unknown as MobileAdmissionService,
    );
    expect(() =>
      disabled.canActivate(
        context('POST', '/api/auth/webauthn/register/options'),
      ),
    ).toThrow();
    expect(() =>
      new PrivateBetaGuard(config).canActivate(
        context('POST', '/api/auth/webauthn/register/options'),
      ),
    ).toThrow();
  });
});
