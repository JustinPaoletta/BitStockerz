import {
  MobileAdmissionService,
  invitationHash,
} from './mobile-admission.service';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';
import { loadAppConfig } from '../config/app-config.service';

const raw = 'a'.repeat(43);
const config = {
  server: { privateBetaMobileEnabled: true },
} as AppConfigService;
function fixture() {
  const db = {
    isEnabled: true,
    mobileInvitation: { findUnique: jest.fn() },
    mobileAdmission: { findUnique: jest.fn() },
    authSession: { findUnique: jest.fn() },
  };
  return {
    db,
    service: new MobileAdmissionService(config, db as unknown as PrismaService),
  };
}

describe('persistent mobile admission', () => {
  it('defaults off and rejects unsafe mobile configuration', () => {
    expect(loadAppConfig({}).server.privateBetaMobileEnabled).toBe(false);
    expect(() =>
      loadAppConfig({ PRIVATE_BETA_MOBILE_ENABLED: 'true' }),
    ).toThrow('PRIVATE_BETA_ENABLED');
    expect(() =>
      loadAppConfig({
        PRIVATE_BETA_MOBILE_ENABLED: 'true',
        PRIVATE_BETA_ENABLED: 'true',
        PRIVATE_BETA_PROXY_KEY: 'c'.repeat(64),
      }),
    ).toThrow('MySQL');
    expect(() =>
      loadAppConfig({
        PRIVATE_BETA_MOBILE_ENABLED: 'true',
        PRIVATE_BETA_ENABLED: 'true',
        PRIVATE_BETA_PROXY_KEY: 'c'.repeat(64),
        DATABASE_URL: 'mysql://localhost/test',
      }),
    ).toThrow('AUTH_DEV_EMAIL_ENABLED=false');
  });

  it('fails startup closed without persistent storage', () => {
    const service = new MobileAdmissionService(config, {
      isEnabled: false,
    } as PrismaService);
    expect(() => service.onModuleInit()).toThrow('MySQL');
  });

  it('hashes enrollment secrets and rejects malformed input without echoing it', () => {
    expect(invitationHash(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(invitationHash(raw)).not.toContain(raw);
    for (const invalid of [undefined, 'sensitive', 'a'.repeat(42), raw + '!'])
      expect(() => invitationHash(invalid)).toThrow(
        'Mobile beta access is unavailable.',
      );
  });

  it('requires matching identity, unexpired and unconsumed invitation without redeeming at options time', async () => {
    const { db, service } = fixture();
    const row = {
      tokenHash: invitationHash(raw),
      email: 'owner@example.com',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      consumedAt: null,
    };
    db.mobileInvitation.findUnique.mockResolvedValue(row);
    await expect(service.authorizeInvitation(row.email, raw)).resolves.toBe(
      row.tokenHash,
    );
    await expect(
      service.authorizeInvitation('other@example.com', raw),
    ).rejects.toThrow();
    for (const invalid of [
      null,
      { ...row, revokedAt: new Date() },
      { ...row, consumedAt: new Date() },
      { ...row, expiresAt: new Date(Date.now() - 1) },
    ]) {
      db.mobileInvitation.findUnique.mockResolvedValueOnce(invalid);
      await expect(
        service.authorizeInvitation(row.email, raw),
      ).rejects.toThrow();
    }
  });

  it('checks live session/admission rows every time, including deleted and revoked users', async () => {
    const { db, service } = fixture();
    const session = {
      expiresAt: new Date(Date.now() + 60_000),
      user: { deletedAt: null, mobileAdmission: { revokedAt: null } },
    };
    const token = '00000000-0000-4000-8000-000000000001';
    db.authSession.findUnique.mockResolvedValue(session);
    await service.requireSession(token);
    for (const invalid of [
      null,
      { ...session, expiresAt: new Date(Date.now() - 1) },
      { ...session, user: { ...session.user, deletedAt: new Date() } },
      { ...session, user: { ...session.user, mobileAdmission: null } },
      {
        ...session,
        user: { ...session.user, mobileAdmission: { revokedAt: new Date() } },
      },
    ]) {
      db.authSession.findUnique.mockResolvedValueOnce(invalid);
      await expect(service.requireSession(token)).rejects.toThrow();
    }
    expect(db.authSession.findUnique).toHaveBeenCalledTimes(6);
    await expect(service.requireSession(undefined)).rejects.toThrow();
    await expect(service.requireSession('not-a-session')).rejects.toThrow();
  });

  it('checks admission by authenticated user ID and rejects revoked/deleted rows', async () => {
    const { db, service } = fixture();
    db.mobileAdmission.findUnique.mockResolvedValue({
      revokedAt: null,
      user: { deletedAt: null },
    });
    await service.requireAdmission('immutable-user-id');
    expect(db.mobileAdmission.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'immutable-user-id' } }),
    );
    for (const invalid of [
      null,
      { revokedAt: new Date(), user: {} },
      { revokedAt: null, user: { deletedAt: new Date() } },
    ]) {
      db.mobileAdmission.findUnique.mockResolvedValueOnce(invalid);
      await expect(
        service.requireAdmission('immutable-user-id'),
      ).rejects.toThrow();
    }
  });
});

describe('atomic mobile enrollment boundary', () => {
  function enrollmentFixture() {
    const tx = {
      mobileInvitation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { create: jest.fn().mockResolvedValue({}) },
      webAuthnCredential: { create: jest.fn().mockResolvedValue({}) },
      mobileAdmission: { create: jest.fn().mockResolvedValue({}) },
      authSession: { create: jest.fn().mockResolvedValue({}) },
    };
    const db = {
      isEnabled: true,
      $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    };
    const service = new MobileAdmissionService(
      config,
      db as unknown as PrismaService,
    );
    const input = {
      invitationHash: 'a'.repeat(64),
      user: {
        id: 'user-id',
        email: 'owner@example.com',
        display_name: 'Owner',
        base_currency: 'USD' as const,
        passkeyCredentialIds: new Set<string>(),
      },
      credential: {
        userId: 'user-id',
        credentialId: 'credential-id',
        credential: {
          id: 'credential-id',
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
          transports: ['internal' as const],
        },
        createdAt: new Date().toISOString(),
        aaguid: 'aaguid',
      },
      session: {
        token: 'token-id',
        expiresAt: Date.now() + 60_000,
        signedInAt: Date.now(),
      },
    };
    return { tx, db, service, input };
  }

  it('claims the same identity and records account, credential, admission, and session in one transaction', async () => {
    const f = enrollmentFixture();
    await f.service.enroll(f.input);
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
    expect(f.tx.mobileInvitation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tokenHash: f.input.invitationHash,
          email: f.input.user.email,
          consumedAt: null,
          revokedAt: null,
        }),
      }),
    );
    for (const delegate of [
      f.tx.user,
      f.tx.webAuthnCredential,
      f.tx.mobileAdmission,
      f.tx.authSession,
    ])
      expect(delegate.create).toHaveBeenCalledTimes(1);
    expect(f.tx.authSession.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id',
        token: 'token-id',
        expiresAt: new Date(f.input.session.expiresAt),
        createdAt: new Date(f.input.session.signedInAt),
      },
    });
  });

  it('rejects an already claimed invitation before creating any account data', async () => {
    const f = enrollmentFixture();
    f.tx.mobileInvitation.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(f.service.enroll(f.input)).rejects.toThrow(
      'Mobile beta access is unavailable.',
    );
    expect(f.tx.user.create).not.toHaveBeenCalled();
    expect(f.tx.authSession.create).not.toHaveBeenCalled();
  });

  it('rejects missing challenge binding before entering the transaction', async () => {
    const f = enrollmentFixture();
    await expect(
      f.service.enroll({ ...f.input, invitationHash: undefined }),
    ).rejects.toThrow();
    expect(f.db.$transaction).not.toHaveBeenCalled();
    f.tx.user.create.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(f.service.enroll(f.input)).rejects.toThrow(
      'storage unavailable',
    );
    expect(f.tx.mobileAdmission.create).not.toHaveBeenCalled();
  });
});
