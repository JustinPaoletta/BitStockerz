import { randomBytes } from 'node:crypto';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthPersistenceService } from './auth-persistence.service';
import { AuthService } from './auth.service';
import { oauthVerifierChallenge } from './oauth-browser.helpers';
import type {
  OauthStateRecord,
  SessionRecord,
  UserRecord,
} from './auth.records';

interface AuthInternals {
  resolveGoogleIdentity(
    input: unknown,
    state: OauthStateRecord,
  ): Promise<{ subject: string; email?: string }>;
  resolveAppleIdentity(
    input: unknown,
    state: OauthStateRecord,
  ): Promise<{ subject: string; email?: string }>;
  sessions: Map<string, SessionRecord>;
  usersByEmail: Map<string, UserRecord>;
}
function setup(configured = true) {
  const config = {
    server: { nodeEnv: 'test' },
    trading: { paperStartingBalance: '100000.00' },
    auth: {
      sessionTtlSeconds: 3600,
      oauthStateTtlSeconds: 300,
      devEmailEnabled: true,
      oauthBrowserCallbackUrl: 'http://localhost:4200/auth/oauth/callback',
      ...(configured
        ? {
            googleClientId: 'google-client',
            googleClientSecret: 'secret',
            googleRedirectUri:
              'http://localhost:4000/api/auth/oauth/google/callback',
            appleClientId: 'apple-client',
            appleTeamId: 'team',
            appleKeyId: 'key',
            applePrivateKey: 'key',
            appleRedirectUri:
              'http://localhost:4000/api/auth/oauth/apple/callback',
          }
        : {}),
    },
  } as AppConfigService;
  const prisma = { isEnabled: false } as PrismaService;
  const persistence = new AuthPersistenceService(prisma);
  const service = new AuthService(config, prisma, persistence);
  const internals = service as unknown as AuthInternals;
  const google = jest
    .spyOn(internals, 'resolveGoogleIdentity')
    .mockResolvedValue({ subject: 'google-1', email: 'google@example.com' });
  const apple = jest
    .spyOn(internals, 'resolveAppleIdentity')
    .mockResolvedValue({
      subject: 'apple-1',
      email: 'relay@privaterelay.appleid.com',
    });
  return { service, internals, google, apple, persistence };
}
function verifier() {
  return randomBytes(32).toString('base64url');
}
function codeFrom(result: unknown): string {
  const redirect = result as { redirect_url: string };
  const url = new URL(redirect.redirect_url);
  expect(url.origin).toBe('http://localhost:4200');
  expect(url.search).toBe('');
  const fragment = new URLSearchParams(url.hash.slice(1));
  expect(fragment.has('access_token')).toBe(false);
  return fragment.get('code')!;
}

describe('OAuth browser sessions and recovery links', () => {
  afterEach(() => jest.useRealTimers());
  it('advertises only fully configured browser providers and rejects unavailable starts', async () => {
    expect(setup().service.getOAuthProviders()).toEqual({
      google: true,
      apple: true,
    });
    const { service } = setup(false);
    expect(service.getOAuthProviders()).toEqual({
      google: false,
      apple: false,
    });
    await expect(
      service.createOAuthBrowserStart('google', {
        code_challenge: oauthVerifierChallenge(verifier()),
        return_path: '/dashboard',
      }),
    ).rejects.toThrow('not available');
  });
  it('creates a verifier-bound single-use login session and rejects concurrent replay', async () => {
    const { service } = setup();
    const secret = verifier();
    const start = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/strategies?tab=active',
    });
    const result = await service.handleOAuthCallback('google', {
      state: start.state,
      code: 'provider-code',
    });
    expect(
      new URLSearchParams(
        new URL((result as { redirect_url: string }).redirect_url).hash.slice(
          1,
        ),
      ).get('state'),
    ).toBe(start.state);
    const code = codeFrom(result);
    await expect(
      service.exchangeOAuthSession({ code, verifier: verifier() }),
    ).rejects.toThrow('invalid');
    const outcomes = await Promise.allSettled([
      service.exchangeOAuthSession({ code, verifier: secret }),
      service.exchangeOAuthSession({ code, verifier: secret }),
    ]);
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(
      1,
    );
    const auth = (
      outcomes.find(
        (item) => item.status === 'fulfilled',
      ) as PromiseFulfilledResult<
        Awaited<ReturnType<AuthService['exchangeOAuthSession']>>
      >
    ).value;
    expect(auth.intent).toBe('login');
    expect(auth.return_path).toBe('/strategies?tab=active');
    expect(service.getProfileBySessionToken(auth.access_token).email).toBe(
      'google@example.com',
    );
  });
  it('keeps linking pending until verifier and the exact initiating session redeem it', async () => {
    const { service } = setup();
    const account = await service.register('existing@example.com');
    const otherSession = await service.login('existing@example.com');
    const secret = verifier();
    const start = await service.createOAuthBrowserStart(
      'google',
      {
        code_challenge: oauthVerifierChallenge(secret),
        return_path: '/account',
      },
      account.access_token,
    );
    const code = codeFrom(
      await service.handleOAuthCallback('google', {
        state: start.state,
        code: 'provider-code',
      }),
    );
    expect(
      service.getProfileBySessionToken(account.access_token).linked_auth_methods
        .google,
    ).toBe(false);
    await expect(
      service.exchangeOAuthSession({ code, verifier: secret }),
    ).rejects.toThrow();
    await expect(
      service.exchangeOAuthSession(
        { code, verifier: secret },
        otherSession.access_token,
      ),
    ).rejects.toThrow('original');
    const linked = await service.exchangeOAuthSession(
      { code, verifier: secret },
      account.access_token,
    );
    expect(linked.access_token).toBe(account.access_token);
    expect(linked.intent).toBe('link');
    expect(linked.user.id).toBe(account.user.id);
    expect(linked.user.linked_auth_methods.google).toBe(true);
    const recovery = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/account',
    });
    const recovered = await service.exchangeOAuthSession({
      code: codeFrom(
        await service.handleOAuthCallback('google', {
          state: recovery.state,
          code: 'code',
        }),
      ),
      verifier: secret,
    });
    expect(recovered.user.id).toBe(account.user.id);
  });
  it('rejects stale, expired, logged-out, and wrong-user linking sessions without changing methods', async () => {
    const { service, internals } = setup();
    const account = await service.register('existing@example.com');
    internals.sessions.get(account.access_token)!.signedInAt =
      Date.now() - 300_001;
    await expect(
      service.createOAuthBrowserStart(
        'google',
        {
          code_challenge: oauthVerifierChallenge(verifier()),
          return_path: '/account',
        },
        account.access_token,
      ),
    ).rejects.toThrow('Sign in again');
    const fresh = await service.login('existing@example.com');
    const other = await service.register('other@example.com');
    const secret = verifier();
    const start = await service.createOAuthBrowserStart(
      'google',
      {
        code_challenge: oauthVerifierChallenge(secret),
        return_path: '/account',
      },
      fresh.access_token,
    );
    const code = codeFrom(
      await service.handleOAuthCallback('google', {
        state: start.state,
        code: 'code',
      }),
    );
    await expect(
      service.exchangeOAuthSession(
        { code, verifier: secret },
        other.access_token,
      ),
    ).rejects.toThrow();
    await service.logout(fresh.access_token);
    await expect(
      service.exchangeOAuthSession(
        { code, verifier: secret },
        fresh.access_token,
      ),
    ).rejects.toThrow();
    expect(
      service.getProfileBySessionToken(account.access_token).linked_auth_methods
        .google,
    ).toBe(false);
  });
  it('fails closed for subjects already owned by another user and never creates a user for links', async () => {
    const { service, internals } = setup();
    const secret = verifier();
    const login = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/account',
    });
    const owner = await service.exchangeOAuthSession({
      code: codeFrom(
        await service.handleOAuthCallback('google', {
          state: login.state,
          code: 'code',
        }),
      ),
      verifier: secret,
    });
    const target = await service.register('existing@example.com');
    const before = internals.usersByEmail.size;
    const link = await service.createOAuthBrowserStart(
      'google',
      {
        code_challenge: oauthVerifierChallenge(secret),
        return_path: '/account',
      },
      target.access_token,
    );
    const code = codeFrom(
      await service.handleOAuthCallback('google', {
        state: link.state,
        code: 'code',
      }),
    );
    await expect(
      service.exchangeOAuthSession(
        { code, verifier: secret },
        target.access_token,
      ),
    ).rejects.toThrow('already linked');
    expect(internals.usersByEmail.size).toBe(before);
    expect(
      service.getProfileBySessionToken(owner.access_token).linked_auth_methods
        .google,
    ).toBe(true);
    expect(
      service.getProfileBySessionToken(target.access_token).linked_auth_methods
        .google,
    ).toBe(false);
  });
  it('returns bounded provider errors, rejects email auto-link, and provisions no account on cancellation', async () => {
    const { service, google, internals } = setup();
    const secret = verifier();
    let start = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/dashboard',
    });
    const cancelled = await service.handleOAuthCallback('google', {
      state: start.state,
      error: 'access_denied',
    });
    expect((cancelled as { redirect_url: string }).redirect_url).toContain(
      'error=cancelled',
    );
    expect(google).not.toHaveBeenCalled();
    expect(internals.usersByEmail.size).toBe(0);
    await service.register('google@example.com');
    start = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/dashboard',
    });
    const conflict = await service.handleOAuthCallback('google', {
      state: start.state,
      code: 'code',
    });
    expect((conflict as { redirect_url: string }).redirect_url).toContain(
      'error=account_conflict',
    );
    expect(internals.usersByEmail.size).toBe(1);
    start = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/dashboard',
    });
    google.mockRejectedValue(new Error('secret provider text'));
    const failure = await service.handleOAuthCallback('google', {
      state: start.state,
      code: 'code',
    });
    expect((failure as { redirect_url: string }).redirect_url).toContain(
      'error=provider_failed',
    );
    expect(JSON.stringify(failure)).not.toContain('secret');
  });
  it('supports Apple private relay then subject-based login when email is omitted', async () => {
    const { service, apple } = setup();
    const secret = verifier();
    const start = await service.createOAuthBrowserStart('apple', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/account',
    });
    const first = await service.exchangeOAuthSession({
      code: codeFrom(
        await service.handleOAuthCallback('apple', {
          state: start.state,
          code: 'code',
          user: '{bad json',
        }),
      ),
      verifier: secret,
    });
    expect(first.user.email).toBe('relay@privaterelay.appleid.com');
    apple.mockResolvedValue({ subject: 'apple-1' });
    const second = await service.createOAuthBrowserStart('apple', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/account',
    });
    const returning = await service.exchangeOAuthSession({
      code: codeFrom(
        await service.handleOAuthCallback('apple', {
          state: second.state,
          code: 'code',
        }),
      ),
      verifier: secret,
    });
    expect(returning.user.id).toBe(first.user.id);
  });
  it('rejects expired handoffs and consumed/provider-mismatched state', async () => {
    jest.useFakeTimers();
    const { service } = setup();
    const secret = verifier();
    const start = await service.createOAuthBrowserStart('google', {
      code_challenge: oauthVerifierChallenge(secret),
      return_path: '/account',
    });
    const mismatch = await service.handleOAuthCallback('apple', {
      state: start.state,
      code: 'code',
    });
    expect((mismatch as { redirect_url: string }).redirect_url).toContain(
      'error=provider_failed',
    );
    const code = codeFrom(
      await service.handleOAuthCallback('google', {
        state: start.state,
        code: 'code',
      }),
    );
    const replay = await service.handleOAuthCallback('google', {
      state: start.state,
      code: 'code',
    });
    expect((replay as { redirect_url: string }).redirect_url).toContain(
      'error=invalid_state',
    );
    jest.advanceTimersByTime(60_001);
    await expect(
      service.exchangeOAuthSession({ code, verifier: secret }),
    ).rejects.toThrow('expired');
    await expect(
      service.exchangeOAuthSession({ code: 'bad', verifier: secret }),
    ).rejects.toThrow();
  });
  it('preserves the cached profile when database save fails', async () => {
    const { service, persistence } = setup();
    const user = await service.register('profile@example.com', 'Original');
    jest
      .spyOn(persistence, 'updateUserProfile')
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.updateProfileBySessionToken(user.access_token, {
        display_name: 'Failed',
      }),
    ).rejects.toThrow();
    expect(
      service.getProfileBySessionToken(user.access_token).display_name,
    ).toBe('Original');
  });
});
