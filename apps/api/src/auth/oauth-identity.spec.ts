import type { JWTPayload } from 'jose';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthPersistenceService } from './auth-persistence.service';
import type { OauthStateRecord } from './auth.records';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';

interface Internals {
  verifyProviderJwt(
    token: string,
    provider: 'google' | 'apple',
    options: unknown,
  ): Promise<{ payload: JWTPayload }>;
  verifyGoogleIdToken(token: string, nonce: string): Promise<JWTPayload>;
  verifyAppleIdToken(token: string, nonce: string): Promise<JWTPayload>;
  exchangeGoogleCodeForIdToken(code: string): Promise<string>;
  exchangeAppleCodeForIdToken(code: string): Promise<string>;
  resolveGoogleIdentity(
    input: { code: string; email?: string; sub?: string },
    state: OauthStateRecord,
  ): Promise<{ subject: string; email?: string }>;
  resolveAppleIdentity(
    input: { code: string; email?: string; user?: string; sub?: string },
    state: OauthStateRecord,
  ): Promise<{ subject: string; email?: string }>;
}
function setup() {
  const config = {
    server: { nodeEnv: 'production' },
    auth: {
      devEmailEnabled: false,
      googleClientId: 'google-client',
      googleClientSecret: 'secret',
      googleRedirectUri: 'https://api.test/google',
      appleClientId: 'apple-client',
      appleTeamId: 'team',
      appleKeyId: 'key',
      applePrivateKey: 'key',
      appleRedirectUri: 'https://api.test/apple',
    },
  } as AppConfigService;
  const prisma = { isEnabled: false } as PrismaService;
  const service = new AuthService(
    config,
    prisma,
    new AuthPersistenceService(prisma),
  );
  return { service, internals: service as unknown as Internals };
}
const state: OauthStateRecord = {
  state: 'state',
  nonce: 'expected-nonce',
  provider: 'google',
  expiresAt: Date.now() + 60000,
};

describe('Verified provider identity claims', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each(['google', 'apple'])(
    'requires signature, issuer, audience, expiry, subject, issued-at and exact nonce for %s',
    async (provider) => {
      const { internals } = setup();
      const jwtVerify = jest.spyOn(internals, 'verifyProviderJwt');
      const verify =
        provider === 'google'
          ? internals.verifyGoogleIdToken.bind(internals)
          : internals.verifyAppleIdToken.bind(internals);
      jwtVerify.mockResolvedValue({
        payload: { sub: 'stable', nonce: 'expected-nonce' },
      });
      await expect(
        verify('signed-token', 'expected-nonce'),
      ).resolves.toMatchObject({ sub: 'stable' });
      expect(jwtVerify).toHaveBeenCalledWith(
        'signed-token',
        provider,
        expect.objectContaining({
          issuer:
            provider === 'google'
              ? ['https://accounts.google.com', 'accounts.google.com']
              : 'https://appleid.apple.com',
          audience: `${provider}-client`,
          algorithms: ['RS256'],
          requiredClaims: ['sub', 'exp', 'iat', 'nonce'],
        }),
      );
      for (const nonce of [undefined, null, 'wrong', 42]) {
        jwtVerify.mockResolvedValue({ payload: { nonce } });
        await expect(verify('signed-token', 'expected-nonce')).rejects.toThrow(
          'nonce',
        );
      }
      jwtVerify.mockRejectedValue(new Error('bad signature, expiry or claims'));
      await expect(verify('tampered-token', 'expected-nonce')).rejects.toThrow(
        'verification failed',
      );
      jwtVerify.mockRejectedValue(
        new DomainError(ErrorCode.UNAUTHORIZED, 'safe error'),
      );
      await expect(verify('bad', 'expected-nonce')).rejects.toThrow(
        'safe error',
      );
    },
  );
  it.each(['google', 'apple'])(
    'uses only verified signed email claims for %s',
    async (provider) => {
      const { internals } = setup();
      const method =
        provider === 'google' ? 'verifyGoogleIdToken' : 'verifyAppleIdToken';
      jest
        .spyOn(
          internals,
          provider === 'google'
            ? 'exchangeGoogleCodeForIdToken'
            : 'exchangeAppleCodeForIdToken',
        )
        .mockResolvedValue('token');
      const payload = jest.spyOn(internals, method);
      const resolve =
        provider === 'google'
          ? internals.resolveGoogleIdentity.bind(internals)
          : internals.resolveAppleIdentity.bind(internals);
      const callback = {
        code: 'code',
        email: 'unsigned@example.com',
        user: '{"email":"unsigned@example.com"}',
        sub: 'unsigned-subject',
      };
      payload.mockResolvedValue({
        sub: 'signed-subject',
        email: 'SIGNED@Example.com',
        email_verified: true,
      });
      await expect(resolve(callback, state)).resolves.toEqual({
        subject: 'signed-subject',
        email: 'signed@example.com',
      });
      for (const claims of [
        { email: 'signed@example.com' },
        { email: 'signed@example.com', email_verified: false },
        { email: 'invalid', email_verified: true },
      ]) {
        payload.mockResolvedValue({ sub: 'signed-subject', ...claims });
        await expect(resolve(callback, state)).rejects.toMatchObject({
          code: ErrorCode.UNAUTHORIZED,
        });
      }
      payload.mockResolvedValue({ sub: 'signed-subject' });
      await expect(resolve(callback, state)).resolves.toEqual({
        subject: 'signed-subject',
        email: undefined,
      });
      payload.mockResolvedValue({
        sub: 'signed-subject',
        email: 'relay@privaterelay.appleid.com',
        email_verified: 'true',
      });
      if (provider === 'apple') {
        await expect(resolve(callback, state)).resolves.toMatchObject({
          email: 'relay@privaterelay.appleid.com',
        });
      } else {
        await expect(resolve(callback, state)).rejects.toMatchObject({
          code: ErrorCode.UNAUTHORIZED,
        });
      }
    },
  );
  it.each(['google', 'apple'])(
    'rejects missing or malformed signed subject for %s',
    async (provider) => {
      const { internals } = setup();
      jest
        .spyOn(
          internals,
          provider === 'google'
            ? 'exchangeGoogleCodeForIdToken'
            : 'exchangeAppleCodeForIdToken',
        )
        .mockResolvedValue('token');
      const payload = jest.spyOn(
        internals,
        provider === 'google' ? 'verifyGoogleIdToken' : 'verifyAppleIdToken',
      );
      const resolve =
        provider === 'google'
          ? internals.resolveGoogleIdentity.bind(internals)
          : internals.resolveAppleIdentity.bind(internals);
      for (const sub of [
        undefined,
        '',
        ' leading',
        'line\nfeed',
        'a'.repeat(256),
      ]) {
        payload.mockResolvedValue({ sub });
        await expect(
          resolve({ code: 'code', sub: 'unsigned' }, state),
        ).rejects.toThrow('subject');
      }
    },
  );
});
