import { AuthPersistenceService } from './auth-persistence.service';
import type { PrismaService } from '../prisma/prisma.service';
import { hashOAuthSecret } from './oauth-browser.helpers';
import type { OAuthHandoffRecord } from './auth.records';

function fixture() {
  const row = {
    id: 'user-1',
    email: 'provider@example.com',
    displayName: 'Trader',
    baseCurrency: 'USD',
    webauthnCredentials: [],
    oauthIdentities: [{ provider: 'google', subject: 'subject-1' }],
  };
  const handoff: OAuthHandoffRecord = {
    codeHash: 'a'.repeat(64),
    userId: row.id,
    provider: 'google',
    intent: 'login',
    codeChallenge: 'b'.repeat(43),
    returnPath: '/account',
    expiresAt: Date.now() + 60000,
  };
  const dbHandoff = {
    ...handoff,
    subject: null as string | null,
    email: null as string | null,
    initiatingSessionHash: null as string | null,
    expiresAt: new Date(handoff.expiresAt),
    createdAt: new Date(),
  };
  const tx = {
    oAuthIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        provider: 'google',
        userId: row.id,
        subject: 'subject-1',
      }),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
    oAuthHandoff: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(dbHandoff),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    authSession: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        token: 'original',
        userId: row.id,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
      }),
    },
  };
  const prisma = {
    isEnabled: true,
    ...tx,
    $transaction: jest.fn(
      async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
    ),
    oAuthState: {
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    webAuthnChallenge: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const service = new AuthPersistenceService(
    prisma as unknown as PrismaService,
  );
  const login = {
    token: 'new-token',
    expiresAt: Date.now() + 3600000,
    signedInAt: Date.now(),
  };
  function redeem(token?: string) {
    return service.redeemOAuthHandoff(
      handoff.codeHash,
      handoff.codeChallenge,
      token,
      login,
    );
  }
  function link() {
    dbHandoff.intent = 'link';
    dbHandoff.subject = 'subject-1';
    dbHandoff.email = 'provider@example.com';
    dbHandoff.initiatingSessionHash = hashOAuthSecret('original');
    tx.oAuthIdentity.findUnique.mockResolvedValue(null);
  }
  return { service, tx, prisma, row, handoff, dbHandoff, login, redeem, link };
}

describe('Atomic OAuth persistence', () => {
  it('persists hashed handoffs and prunes abandoned expired records', async () => {
    const { service, tx, handoff } = fixture();
    await service.saveOAuthHandoff(handoff);
    expect(tx.oAuthHandoff.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        codeHash: handoff.codeHash,
        expiresAt: expect.any(Date),
      }),
    });
    await service.pruneOAuthHandoffs();
    expect(tx.oAuthHandoff.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: expect.any(Date) } },
    });
  });
  it('resolves an existing subject before email and persists handoff in the same transaction', async () => {
    const { service, tx, row, handoff } = fixture();
    const user = await service.resolveOAuthUser(
      'google',
      { subject: 'subject-1', email: 'other-user@example.com' },
      '100000',
      handoff,
    );
    expect(user.id).toBe(row.id);
    expect(user.googleSubject).toBe('subject-1');
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.findUnique).not.toHaveBeenCalled();
    expect(tx.oAuthHandoff.create).toHaveBeenCalledTimes(1);
  });
  it.each(['SUBJECT-1', 'súbject-1'])(
    'refuses case/accent-insensitive subject matches for %s',
    async (subject) => {
      const { service, tx, handoff, row } = fixture();
      tx.oAuthIdentity.findUnique.mockResolvedValue({
        provider: 'google',
        subject: 'subject-1',
        userId: row.id,
        user: row,
      });
      await expect(
        service.findOAuthUser('google', subject),
      ).resolves.toBeNull();
      await expect(
        service.resolveOAuthUser(
          'google',
          { subject, email: 'new@example.com' },
          '100000',
          handoff,
        ),
      ).rejects.toThrow('could not be verified');
      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.oAuthHandoff.create).not.toHaveBeenCalled();
    },
  );
  it('prunes expired OAuth states, handoffs and WebAuthn challenges with the same bounded cutoff', async () => {
    const { service, prisma } = fixture();
    await service.pruneOAuthHandoffs();
    const cutoff = prisma.oAuthHandoff.deleteMany.mock.calls[0][0];
    expect(cutoff).toEqual({ where: { expiresAt: { lte: expect.any(Date) } } });
    expect(prisma.oAuthState.deleteMany).toHaveBeenCalledWith(cutoff);
    expect(prisma.webAuthnChallenge.deleteMany).toHaveBeenCalledWith(cutoff);
  });
  it('atomically provisions user, provider subject and exactly one paper account', async () => {
    const { service, tx } = fixture();
    tx.oAuthIdentity.findUnique.mockResolvedValue(null);
    await service.resolveOAuthUser(
      'apple',
      { subject: 'apple-1', email: 'relay@privaterelay.appleid.com' },
      '120000',
    );
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'relay@privaterelay.appleid.com',
        oauthIdentities: {
          create: expect.objectContaining({
            provider: 'apple',
            subject: 'apple-1',
          }),
        },
        paperAccount: {
          create: expect.objectContaining({
            startingBalance: '120000',
            cashBalance: '120000',
          }),
        },
      }),
    });
    expect(tx.oAuthHandoff.create).not.toHaveBeenCalled();
  });
  it('rejects unverified signup and email collisions before creating any user', async () => {
    const { service, tx } = fixture();
    tx.oAuthIdentity.findUnique.mockResolvedValue(null);
    await expect(
      service.resolveOAuthUser('google', { subject: 'subject-1' }, '100000'),
    ).rejects.toThrow('verified');
    tx.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.resolveOAuthUser(
        'google',
        { subject: 'subject-1', email: 'existing@example.com' },
        '100000',
      ),
    ).rejects.toThrow('existing account');
    expect(tx.user.create).not.toHaveBeenCalled();
  });
  it.each(['P2002', 'P2034'])(
    'retries racing signup %s and reuses the winner',
    async (code) => {
      const { service, prisma } = fixture();
      prisma.$transaction.mockRejectedValueOnce({ code });
      await expect(
        service.resolveOAuthUser(
          'google',
          { subject: 'subject-1', email: 'provider@example.com' },
          '100000',
        ),
      ).resolves.toMatchObject({ id: 'user-1' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );
  it('bounds retry conflicts and propagates unexpected failures without publishing memory', async () => {
    const { service, prisma } = fixture();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });
    await expect(
      service.resolveOAuthUser(
        'google',
        { subject: 'subject-1', email: 'provider@example.com' },
        '100000',
      ),
    ).rejects.toThrow('conflicts');
    expect(prisma.$transaction).toHaveBeenCalledTimes(4);
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));
    await expect(
      service.resolveOAuthUser('google', { subject: 'subject-1' }, '100000'),
    ).rejects.toThrow('database unavailable');
  });
  it('loads provider users from persistence and optional profile metadata', async () => {
    const { service, tx, row } = fixture();
    tx.oAuthIdentity.findUnique.mockResolvedValue({
      provider: 'apple',
      subject: 'apple-1',
      user: {
        ...row,
        displayName: null,
        webauthnCredentials: [{ credentialId: 'credential-1' }],
        oauthIdentities: [{ provider: 'apple', subject: 'apple-1' }],
      },
    });
    const user = await service.findOAuthUser('apple', 'apple-1');
    expect(user?.passkeyCredentialIds.has('credential-1')).toBe(true);
    expect(user?.appleSubject).toBe('apple-1');
    expect(user?.display_name).toBeUndefined();
    tx.oAuthIdentity.findUnique.mockResolvedValue(null);
    await expect(service.findOAuthUser('apple', 'absent')).resolves.toBeNull();
  });
  it('issues a login session only inside successful one-use redemption', async () => {
    const { tx, redeem, login } = fixture();
    const result = await redeem();
    expect(result.user.id).toBe('user-1');
    expect(result.handoff.intent).toBe('login');
    expect(tx.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        token: login.token,
        createdAt: new Date(login.signedInAt),
      }),
    });
    expect(tx.oAuthHandoff.deleteMany).toHaveBeenCalledWith({
      where: { codeHash: 'a'.repeat(64), expiresAt: { gt: expect.any(Date) } },
    });
  });
  it.each(['absent', 'expired', 'wrongVerifier', 'nonexactCodeHash'])(
    'fails %s handoffs before creating session or linking',
    async (kind) => {
      const { tx, dbHandoff, redeem } = fixture();
      if (kind === 'absent') tx.oAuthHandoff.findUnique.mockResolvedValue(null);
      else if (kind === 'expired')
        dbHandoff.expiresAt = new Date(Date.now() - 1);
      else if (kind === 'wrongVerifier') dbHandoff.codeChallenge = 'wrong';
      else dbHandoff.codeHash = dbHandoff.codeHash.toUpperCase();
      await expect(redeem()).rejects.toThrow('invalid or expired');
      expect(tx.authSession.create).not.toHaveBeenCalled();
      expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
      expect(tx.oAuthHandoff.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('fails a racing handoff claim so its enclosing transaction rolls back session creation', async () => {
    const { tx, redeem } = fixture();
    tx.oAuthHandoff.deleteMany.mockResolvedValue({ count: 0 });
    await expect(redeem()).rejects.toThrow('already been used');
  });
  it('attaches pending links atomically after the original session proves ownership', async () => {
    const { link, redeem, tx } = fixture();
    link();
    const result = await redeem('original');
    expect(result.handoff.intent).toBe('link');
    expect(tx.oAuthIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        provider: 'google',
        subject: 'subject-1',
      }),
    });
    expect(tx.authSession.create).not.toHaveBeenCalled();
  });
  it('permits idempotent linking of an already owned subject', async () => {
    const { link, redeem, tx } = fixture();
    link();
    tx.oAuthIdentity.findUnique.mockResolvedValue({
      provider: 'google',
      userId: 'user-1',
      subject: 'subject-1',
    });
    await expect(redeem('original')).resolves.toMatchObject({
      handoff: { intent: 'link' },
    });
    expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
  });
  it.each([
    'missingToken',
    'absentSession',
    'wrongUser',
    'expiredSession',
    'staleSession',
    'wrongSession',
    'nonexactToken',
  ])('rejects %s link ownership without attaching', async (kind) => {
    const { link, redeem, tx, dbHandoff } = fixture();
    link();
    if (kind === 'absentSession')
      tx.authSession.findUnique.mockResolvedValue(null);
    if (kind === 'wrongUser')
      tx.authSession.findUnique.mockResolvedValue({
        token: 'original',
        userId: 'other',
      });
    if (kind === 'expiredSession')
      tx.authSession.findUnique.mockResolvedValue({
        token: 'original',
        userId: 'user-1',
        expiresAt: new Date(Date.now() - 1),
      });
    if (kind === 'staleSession')
      tx.authSession.findUnique.mockResolvedValue({
        token: 'original',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 10000),
        createdAt: new Date(Date.now() - 300001),
      });
    if (kind === 'nonexactToken')
      tx.authSession.findUnique.mockResolvedValue({
        token: 'ORIGINAL',
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });
    if (kind === 'wrongSession')
      dbHandoff.initiatingSessionHash = hashOAuthSecret('different');
    await expect(
      redeem(kind === 'missingToken' ? undefined : 'original'),
    ).rejects.toThrow('Sign in again');
    expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
    expect(tx.oAuthHandoff.deleteMany).not.toHaveBeenCalled();
  });
  it.each(['otherOwner', 'otherSubject', 'subjectCaseVariant'])(
    'rejects %s link conflicts',
    async (kind) => {
      const { link, redeem, tx } = fixture();
      link();
      tx.oAuthIdentity.findUnique.mockResolvedValue({
        provider: 'google',
        userId: kind === 'otherOwner' ? 'other-user' : 'user-1',
        subject:
          kind === 'otherSubject'
            ? 'other-subject'
            : kind === 'subjectCaseVariant'
              ? 'SUBJECT-1'
              : 'subject-1',
      });
      await expect(redeem('original')).rejects.toThrow('already linked');
      expect(tx.oAuthIdentity.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['P2002', 'already linked'],
    ['P2034', 'already been used'],
    ['UNEXPECTED', 'database failed'],
  ])('handles transaction failure %s safely', async (code, message) => {
    const { prisma, redeem } = fixture();
    prisma.$transaction.mockRejectedValue(
      Object.assign(new Error('database failed'), { code }),
    );
    await expect(redeem()).rejects.toThrow(message);
  });
  it('finds state metadata and atomically claims only one matching callback', async () => {
    const { service, prisma } = fixture();
    const row = {
      state: 'state',
      provider: 'google',
      nonce: 'nonce',
      expiresAt: new Date(Date.now() + 60000),
      mode: 'browser',
      intent: 'link',
      codeChallenge: 'b'.repeat(43),
      returnPath: '/account',
      initiatingUserId: 'user-1',
      initiatingSessionHash: 'hash',
    };
    prisma.oAuthState.findUnique.mockResolvedValue(row);
    await expect(service.findOAuthState('state')).resolves.toMatchObject({
      intent: 'link',
      initiatingUserId: 'user-1',
    });
    await expect(
      service.consumeOAuthState('state', 'google'),
    ).resolves.toMatchObject({ mode: 'browser' });
    prisma.oAuthState.deleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.consumeOAuthState('state', 'google'),
    ).resolves.toBeNull();
    prisma.oAuthState.findUnique.mockResolvedValue(null);
    await expect(service.findOAuthState('missing')).resolves.toBeNull();
    const disabled = new AuthPersistenceService({
      isEnabled: false,
    } as PrismaService);
    await expect(disabled.findOAuthState('state')).resolves.toBeNull();
    await expect(disabled.pruneOAuthHandoffs()).resolves.toBeUndefined();
  });
});
