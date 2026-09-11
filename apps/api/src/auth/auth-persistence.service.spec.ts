import type { PrismaService } from '../prisma/prisma.service';
import { AuthPersistenceService } from './auth-persistence.service';
import type { UserRecord } from './auth.records';

function createUser(overrides?: Partial<UserRecord>): UserRecord {
  return {
    id: 'user-1',
    email: 'user@example.com',
    display_name: 'User',
    base_currency: 'USD',
    passkeyCredentialIds: new Set<string>(),
    ...overrides,
  };
}

function createPrismaMock(
  overrides?: Partial<PrismaService>,
): PrismaService {
  return {
    isEnabled: true,
    user: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    authSession: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    webAuthnCredential: {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
    oAuthIdentity: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    webAuthnChallenge: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    oAuthState: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    ...overrides,
  } as unknown as PrismaService;
}

describe('AuthPersistenceService', () => {
  it('no-ops when prisma is disabled', async () => {
    const prisma = createPrismaMock({ isEnabled: false });
    const service = new AuthPersistenceService(prisma);
    const user = createUser();

    await service.saveUser(user);
    await service.saveSession('token', user.id, Date.now() + 1000);
    await service.updateUserProfile(user);
    await service.deleteSession('token');
    await service.updateCredentialCounter('cred-1', 1);
    await service.saveOAuthIdentity('google', 'sub', user.id, user.email);
    await service.saveWebAuthnChallenge({
      challengeId: 'challenge-1',
      purpose: 'login',
      email: user.email,
      challenge: 'abc',
      expiresAt: Date.now() + 1000,
    });
    await service.saveOAuthState({
      state: 'state-1',
      provider: 'google',
      nonce: 'nonce',
      expiresAt: Date.now() + 1000,
    });
    await service.saveCredential({
      credentialId: 'cred-1',
      userId: user.id,
      credential: {
        id: 'cred-1',
        publicKey: new Uint8Array([1]),
        counter: 0,
      },
      createdAt: new Date().toISOString(),
    });

    expect(prisma.user.upsert).not.toHaveBeenCalled();
    expect(prisma.authSession.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.authSession.deleteMany).not.toHaveBeenCalled();
    expect(prisma.webAuthnCredential.update).not.toHaveBeenCalled();
    expect(prisma.oAuthIdentity.upsert).not.toHaveBeenCalled();
    expect(prisma.webAuthnChallenge.create).not.toHaveBeenCalled();
    expect(prisma.oAuthState.create).not.toHaveBeenCalled();
    expect(prisma.webAuthnCredential.create).not.toHaveBeenCalled();
  });

  it('hydrates users, credentials, oauth links, and sessions', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const prisma = createPrismaMock({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            baseCurrency: 'USD',
            webauthnCredentials: [
              {
                credentialId: 'cred-1',
                userId: 'user-1',
                publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
                signCount: BigInt(2),
                transports: JSON.stringify(['internal']),
                aaguid: 'aaguid',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
            oauthIdentities: [
              {
                provider: 'google',
                subject: 'google-sub',
                userId: 'user-1',
                email: 'user@example.com',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
          },
        ]),
      },
      authSession: {
        findMany: jest.fn().mockResolvedValue([
          {
            token: 'session-1',
            userId: 'user-1',
            expiresAt,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);
    const snapshot = {
      usersByEmail: new Map<string, UserRecord>(),
      usersById: new Map<string, UserRecord>(),
      sessions: new Map<string, { userId: string; expiresAt: number }>(),
      credentialsById: new Map(),
      googleSubjectsToUserIds: new Map<string, string>(),
      appleSubjectsToUserIds: new Map<string, string>(),
    };

    await service.hydrate(snapshot);

    expect(snapshot.usersById.get('user-1')?.email).toBe('user@example.com');
    expect(snapshot.googleSubjectsToUserIds.get('google-sub')).toBe('user-1');
    expect(snapshot.sessions.get('session-1')?.userId).toBe('user-1');
    expect(snapshot.credentialsById.get('cred-1')?.credential.counter).toBe(2);
  });

  it('persists users, sessions, credentials, and oauth identities', async () => {
    const prisma = createPrismaMock();
    const service = new AuthPersistenceService(prisma);
    const user = createUser();

    await service.saveUser(user);
    await service.saveSession('token-1', user.id, Date.now() + 1000);
    await service.saveCredential({
      credentialId: 'cred-1',
      userId: user.id,
      credential: {
        id: 'cred-1',
        publicKey: new Uint8Array([1, 2, 3]),
        counter: 1,
        transports: ['internal'],
      },
      createdAt: new Date().toISOString(),
    });
    await service.saveOAuthIdentity('google', 'sub-1', user.id, user.email);

    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(prisma.authSession.create).toHaveBeenCalled();
    expect(prisma.webAuthnCredential.create).toHaveBeenCalled();
    expect(prisma.oAuthIdentity.upsert).toHaveBeenCalled();
  });

  it('consumes webauthn challenges and oauth state from mysql', async () => {
    const prisma = createPrismaMock({
      webAuthnChallenge: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'challenge-1',
          purpose: 'register',
          email: 'user@example.com',
          challenge: 'abc',
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
        }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      oAuthState: {
        findUnique: jest.fn().mockResolvedValue({
          state: 'state-1',
          provider: 'google',
          nonce: 'nonce-1',
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
        }),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);

    const challenge = await service.consumeWebAuthnChallenge(
      'challenge-1',
      'register',
      'user@example.com',
    );
    const oauthState = await service.consumeOAuthState('state-1', 'google');

    expect(challenge?.challengeId).toBe('challenge-1');
    expect(oauthState?.provider).toBe('google');
  });

  it('reports enabled when prisma is configured', () => {
    const service = new AuthPersistenceService(createPrismaMock());
    expect(service.enabled).toBe(true);
  });

  it('hydrates apple oauth identities and decodes invalid transports', async () => {
    const prisma = createPrismaMock({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-2',
            email: 'apple@example.com',
            displayName: null,
            baseCurrency: null,
            webauthnCredentials: [
              {
                credentialId: 'cred-2',
                userId: 'user-2',
                publicKey: Buffer.from([4, 5]).toString('base64url'),
                signCount: BigInt(0),
                transports: null,
                aaguid: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
            oauthIdentities: [
              {
                provider: 'apple',
                subject: 'apple-sub',
                userId: 'user-2',
                email: 'apple@example.com',
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
          },
        ]),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);
    const snapshot = {
      usersByEmail: new Map<string, UserRecord>(),
      usersById: new Map<string, UserRecord>(),
      sessions: new Map<string, { userId: string; expiresAt: number }>(),
      credentialsById: new Map(),
      googleSubjectsToUserIds: new Map<string, string>(),
      appleSubjectsToUserIds: new Map<string, string>(),
    };

    await service.hydrate(snapshot);

    expect(snapshot.appleSubjectsToUserIds.get('apple-sub')).toBe('user-2');
    expect(snapshot.usersById.get('user-2')?.appleSubject).toBe('apple-sub');
    expect(snapshot.usersById.get('user-2')?.base_currency).toBe('USD');
    expect(snapshot.credentialsById.get('cred-2')?.credential.transports).toBeUndefined();
  });

  it('decodes non-array and invalid transport payloads', async () => {
    const prisma = createPrismaMock({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-3',
            email: 'transports@example.com',
            displayName: 'User',
            baseCurrency: 'USD',
            webauthnCredentials: [
              {
                credentialId: 'cred-invalid',
                userId: 'user-3',
                publicKey: Buffer.from([1]).toString('base64url'),
                signCount: BigInt(0),
                transports: 'not-json',
                aaguid: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
              {
                credentialId: 'cred-object',
                userId: 'user-3',
                publicKey: Buffer.from([2]).toString('base64url'),
                signCount: BigInt(0),
                transports: JSON.stringify({ kind: 'internal' }),
                aaguid: null,
                createdAt: new Date('2026-01-01T00:00:00.000Z'),
              },
            ],
            oauthIdentities: [],
          },
        ]),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);
    const snapshot = {
      usersByEmail: new Map<string, UserRecord>(),
      usersById: new Map<string, UserRecord>(),
      sessions: new Map<string, { userId: string; expiresAt: number }>(),
      credentialsById: new Map(),
      googleSubjectsToUserIds: new Map<string, string>(),
      appleSubjectsToUserIds: new Map<string, string>(),
    };

    await service.hydrate(snapshot);

    expect(
      snapshot.credentialsById.get('cred-invalid')?.credential.transports,
    ).toBeUndefined();
    expect(
      snapshot.credentialsById.get('cred-object')?.credential.transports,
    ).toBeUndefined();
  });

  it('updates profiles, deletes sessions, and updates credential counters', async () => {
    const prisma = createPrismaMock();
    const service = new AuthPersistenceService(prisma);
    const user = createUser({ display_name: 'Updated', base_currency: 'EUR' });

    await service.updateUserProfile(user);
    await service.deleteSession('token-1');
    await service.updateCredentialCounter('cred-1', 5);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: user.id },
        data: expect.objectContaining({ baseCurrency: 'EUR' }),
      }),
    );
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { token: 'token-1' },
    });
    expect(prisma.webAuthnCredential.update).toHaveBeenCalledWith({
      where: { credentialId: 'cred-1' },
      data: { signCount: BigInt(5) },
    });
  });

  it('persists webauthn challenges and oauth state', async () => {
    const prisma = createPrismaMock();
    const service = new AuthPersistenceService(prisma);
    const expiresAt = Date.now() + 60_000;

    await service.saveWebAuthnChallenge({
      challengeId: 'challenge-2',
      purpose: 'login',
      email: 'user@example.com',
      challenge: 'xyz',
      expiresAt,
    });
    await service.saveOAuthState({
      state: 'state-2',
      provider: 'apple',
      nonce: 'nonce-2',
      expiresAt,
    });

    expect(prisma.webAuthnChallenge.create).toHaveBeenCalled();
    expect(prisma.oAuthState.create).toHaveBeenCalled();
  });

  it('returns null from consume helpers when prisma is disabled', async () => {
    const prisma = createPrismaMock({ isEnabled: false });
    const service = new AuthPersistenceService(prisma);

    await expect(
      service.consumeWebAuthnChallenge('id', 'login', 'user@example.com'),
    ).resolves.toBeNull();
    await expect(service.consumeOAuthState('state', 'google')).resolves.toBeNull();
    await expect(service.findSession('token')).resolves.toBeNull();
    await expect(service.ensureUserExists('user-1')).resolves.toBe(false);
  });

  it('rejects expired or mismatched webauthn challenges', async () => {
    const deleteChallenge = jest.fn().mockResolvedValue({});
    const prisma = createPrismaMock({
      webAuthnChallenge: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'expired',
            purpose: 'login',
            email: 'user@example.com',
            challenge: 'abc',
            expiresAt: new Date(Date.now() - 1),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce({
            id: 'mismatch',
            purpose: 'register',
            email: 'other@example.com',
            challenge: 'abc',
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce(null),
        delete: deleteChallenge,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);

    await expect(
      service.consumeWebAuthnChallenge('expired', 'login', 'user@example.com'),
    ).resolves.toBeNull();
    await expect(
      service.consumeWebAuthnChallenge('mismatch', 'login', 'user@example.com'),
    ).resolves.toBeNull();
    await expect(
      service.consumeWebAuthnChallenge('missing', 'login', 'user@example.com'),
    ).resolves.toBeNull();
    expect(deleteChallenge).toHaveBeenCalledWith({ where: { id: 'expired' } });
  });

  it('rejects expired, mismatched, or missing oauth state', async () => {
    const deleteState = jest.fn().mockResolvedValue({});
    const prisma = createPrismaMock({
      oAuthState: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            state: 'expired',
            provider: 'google',
            nonce: 'nonce',
            expiresAt: new Date(Date.now() - 1),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce({
            state: 'wrong-provider',
            provider: 'apple',
            nonce: 'nonce',
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce(null),
        delete: deleteState,
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);

    await expect(service.consumeOAuthState('expired', 'google')).resolves.toBeNull();
    await expect(
      service.consumeOAuthState('wrong-provider', 'google'),
    ).resolves.toBeNull();
    await expect(service.consumeOAuthState('missing', 'google')).resolves.toBeNull();
    expect(deleteState).toHaveBeenCalledWith({ where: { state: 'expired' } });
  });

  it('finds active sessions and removes expired ones', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = createPrismaMock({
      authSession: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            token: 'active',
            userId: 'user-1',
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce({
            token: 'expired',
            userId: 'user-1',
            expiresAt: new Date(Date.now() - 1),
            createdAt: new Date(),
          })
          .mockResolvedValueOnce(null),
        deleteMany,
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);

    await expect(service.findSession('active')).resolves.toEqual({
      userId: 'user-1',
      expiresAt: expect.any(Number),
    });
    await expect(service.findSession('expired')).resolves.toBeNull();
    await expect(service.findSession('missing')).resolves.toBeNull();
    expect(deleteMany).toHaveBeenCalledWith({ where: { token: 'expired' } });
  });

  it('checks whether a user exists in mysql', async () => {
    const prisma = createPrismaMock({
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'user-1' })
          .mockResolvedValueOnce(null),
      },
    } as Partial<PrismaService>);
    const service = new AuthPersistenceService(prisma);

    await expect(service.ensureUserExists('user-1')).resolves.toBe(true);
    await expect(service.ensureUserExists('missing')).resolves.toBe(false);
  });

  it('stores credentials without transports', async () => {
    const prisma = createPrismaMock();
    const service = new AuthPersistenceService(prisma);

    await service.saveCredential({
      credentialId: 'cred-3',
      userId: 'user-1',
      credential: {
        id: 'cred-3',
        publicKey: new Uint8Array([1]),
        counter: 0,
      },
      createdAt: new Date().toISOString(),
    });

    expect(prisma.webAuthnCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ transports: null }),
      }),
    );
  });
});
