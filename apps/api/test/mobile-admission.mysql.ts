import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '../src/config/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthPersistenceService } from '../src/auth/auth-persistence.service';
import { AuthService } from '../src/auth/auth.service';
import {
  MobileAdmissionService,
  invitationHash,
} from '../src/auth/mobile-admission.service';
import type { UserRecord } from '../src/auth/auth.records';
import { PrivateBetaGuard } from '../src/common/http/private-beta.guard';
import type { ExecutionContext } from '@nestjs/common';

// Disposable MySQL fixture only. Credentials below represent an already-verified
// passkey boundary; real cryptographic verification is covered by auth tests and
// remains a physical-device gate. This test exercises real SQL transactions,
// invitation races, restart hydration, revocation, and DB failure behavior.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  const target = new URL(process.env.DATABASE_URL);
  if (
    !['mysql:', 'mariadb:'].includes(target.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^bitstockerz_(?:[a-z0-9_]*_)?ci$/.test(target.pathname.slice(1))
  )
    throw new Error(
      'A disposable localhost bitstockerz_*ci fixture is required',
    );
  Object.assign(process.env, {
    NODE_ENV: 'development',
    PRIVATE_BETA_ENABLED: 'true',
    PRIVATE_BETA_PROXY_KEY: 'a'.repeat(64),
    PRIVATE_BETA_MOBILE_ENABLED: 'true',
    AUTH_DEV_EMAIL_ENABLED: 'false',
    AUTH_LEGACY_WEBAUTHN_ENABLED: 'false',
    INGESTION_SCHEDULER_ENABLED: 'false',
    WEBAUTHN_RP_ID: 'login.example.com',
    WEBAUTHN_ALLOWED_ORIGINS: 'https://login.example.com',
  });
  const config = new AppConfigService();
  const prisma = new PrismaService(config);
  const prefix = `mobile-${randomUUID()}`;
  const emails: string[] = [];
  const hashes: string[] = [];
  const userIds: string[] = [];
  const challengeIds: string[] = [];
  const make = (
    email: string,
    credentialId = randomBytes(24).toString('base64url'),
  ) => {
    const user: UserRecord = {
      id: randomUUID(),
      email,
      base_currency: 'USD',
      passkeyCredentialIds: new Set(),
    };
    userIds.push(user.id);
    return {
      user,
      credential: {
        userId: user.id,
        credentialId,
        credential: {
          id: credentialId,
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0,
        },
        createdAt: new Date().toISOString(),
      },
      session: {
        token: randomUUID(),
        expiresAt: Date.now() + 60_000,
        signedInAt: Date.now(),
      },
    };
  };
  const invite = async (
    suffix: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const email = `${prefix}-${suffix}@example.com`;
    const token = randomBytes(32).toString('base64url');
    const hash = invitationHash(token);
    emails.push(email);
    hashes.push(hash);
    await prisma.mobileInvitation.create({
      data: {
        tokenHash: hash,
        email,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        ...overrides,
      },
    });
    return { email, token, hash };
  };
  try {
    await prisma.ping();
    const mobile = new MobileAdmissionService(config, prisma);
    mobile.onModuleInit();
    const persistence = new AuthPersistenceService(prisma);
    let auth = new AuthService(config, prisma, persistence, undefined, mobile);
    await auth.onModuleInit();

    const enrollment = await invite('race');
    const options = await auth.createWebAuthnRegisterOptions(
      enrollment.email,
      enrollment.token,
    );
    challengeIds.push(options.challenge_id);
    // Cancelled ceremonies and multiple options requests do not redeem tokens.
    assert.equal(
      await mobile.authorizeInvitation(enrollment.email, enrollment.token),
      enrollment.hash,
    );
    const persistedChallenge = await persistence.consumeWebAuthnChallenge(
      options.challenge_id,
      'register',
      enrollment.email,
    );
    assert.equal(persistedChallenge?.invitationHash, enrollment.hash);
    assert.equal(
      await persistence.consumeWebAuthnChallenge(
        options.challenge_id,
        'register',
        enrollment.email,
      ),
      null,
    );
    await assert.rejects(
      mobile.authorizeInvitation('other@example.com', enrollment.token),
    );

    const candidates = [make(enrollment.email), make(enrollment.email)];
    const race = await Promise.allSettled(
      candidates.map((candidate) =>
        mobile.enroll({ ...candidate, invitationHash: enrollment.hash }),
      ),
    );
    assert.equal(
      race.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      race.filter((result) => result.status === 'rejected').length,
      1,
    );
    const winner =
      candidates[race.findIndex((result) => result.status === 'fulfilled')];
    assert.equal(
      await prisma.user.count({ where: { email: enrollment.email } }),
      1,
    );
    assert.equal(
      await prisma.mobileAdmission.count({
        where: { userId: { in: candidates.map((c) => c.user.id) } },
      }),
      1,
    );
    assert.equal(
      await prisma.authSession.count({
        where: { userId: { in: candidates.map((c) => c.user.id) } },
      }),
      1,
    );
    await assert.rejects(
      mobile.enroll({
        ...make(enrollment.email),
        invitationHash: enrollment.hash,
      }),
    );
    await assert.rejects(
      mobile.authorizeInvitation(enrollment.email, enrollment.token),
    );
    await mobile.requireSession(winner.session.token);

    // A fresh AuthService has no local state until persisted users/sessions hydrate.
    auth = new AuthService(
      config,
      prisma,
      new AuthPersistenceService(prisma),
      undefined,
      new MobileAdmissionService(config, prisma),
    );
    await auth.onModuleInit();
    assert.equal(
      auth.requireUserBySessionToken(winner.session.token).id,
      winner.user.id,
    );
    const restartedMobile = new MobileAdmissionService(config, prisma);
    await restartedMobile.requireSession(winner.session.token);
    const guard = new PrivateBetaGuard(config, restartedMobile);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/api/me',
          headers: { authorization: `Bearer ${winner.session.token}` },
        }),
      }),
    } as ExecutionContext;
    assert.equal(await guard.canActivate(ctx), true);
    await prisma.mobileAdmission.update({
      where: { userId: winner.user.id },
      data: { revokedAt: new Date() },
    });
    // AuthService still has the bearer cached; global mobile perimeter must reject it.
    assert.equal(
      auth.requireUserBySessionToken(winner.session.token).id,
      winner.user.id,
    );
    await assert.rejects(Promise.resolve().then(() => guard.canActivate(ctx)));
    const proxiedCtx = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          path: '/api/me',
          headers: {
            authorization: `Bearer ${winner.session.token}`,
            'x-bitstockerz-beta-key': 'a'.repeat(64),
          },
        }),
      }),
    } as ExecutionContext;
    await assert.rejects(
      Promise.resolve().then(() => guard.canActivate(proxiedCtx)),
    );
    await assert.rejects(restartedMobile.requireAdmission(winner.user.id));

    const rollback = await invite('rollback');
    const collision = make(rollback.email, winner.credential.credentialId);
    await assert.rejects(
      mobile.enroll({ ...collision, invitationHash: rollback.hash }),
    );
    assert.equal(
      await prisma.user.findUnique({ where: { id: collision.user.id } }),
      null,
    );
    assert.equal(
      (
        await prisma.mobileInvitation.findUniqueOrThrow({
          where: { tokenHash: rollback.hash },
        })
      ).consumedAt,
      null,
    );
    await mobile.enroll({
      ...make(rollback.email),
      invitationHash: rollback.hash,
    });

    for (const [suffix, overrides] of [
      ['expired', { expiresAt: new Date(Date.now() - 1) }],
      ['revoked', { revokedAt: new Date() }],
    ] as const) {
      const invalid = await invite(suffix, overrides);
      await assert.rejects(
        mobile.authorizeInvitation(invalid.email, invalid.token),
      );
      await assert.rejects(
        mobile.enroll({ ...make(invalid.email), invitationHash: invalid.hash }),
      );
      assert.equal(
        await prisma.user.count({ where: { email: invalid.email } }),
        0,
      );
    }

    const mismatched = await invite('identity');
    await assert.rejects(
      mobile.enroll({
        ...make(`${prefix}-wrong@example.com`),
        invitationHash: mismatched.hash,
      }),
    );
    assert.equal(
      (
        await prisma.mobileInvitation.findUniqueOrThrow({
          where: { tokenHash: mismatched.hash },
        })
      ).consumedAt,
      null,
    );

    const active = await invite('session');
    const signedIn = make(active.email);
    await mobile.enroll({ ...signedIn, invitationHash: active.hash });
    await mobile.requireSession(signedIn.session.token);
    await prisma.authSession.update({
      where: { token: signedIn.session.token },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await assert.rejects(mobile.requireSession(signedIn.session.token));
    await prisma.authSession.delete({
      where: { token: signedIn.session.token },
    });
    await assert.rejects(mobile.requireSession(signedIn.session.token));

    console.log(
      'MySQL mobile admission passed: invitation binding, identity/expiry/replay, concurrent claim, transaction rollback, restart hydration, live session and admission revocation.',
    );
  } finally {
    await prisma.webAuthnChallenge.deleteMany({
      where: { id: { in: challengeIds } },
    });
    await prisma.webAuthnCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.mobileInvitation.deleteMany({
      where: { tokenHash: { in: hashes } },
    });
    await prisma.onModuleDestroy();
  }
}
main().catch(() => {
  console.error(
    'MySQL mobile admission fixture failed; no connection or invitation values are logged.',
  );
  process.exitCode = 1;
});
