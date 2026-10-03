import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthPersistenceService } from '../src/auth/auth-persistence.service';
import { AuthService } from '../src/auth/auth.service';
import { BacktestsService } from '../src/backtest/backtests.service';
import { DomainError } from '../src/common/errors/domain-error';
import { ErrorCode } from '../src/common/errors/error-codes.enum';
import { PrismaService } from '../src/prisma/prisma.service';
import type { StrategyDefinition } from '../src/strategies/definition/strategy-definition.types';
import { StrategiesService } from '../src/strategies/strategies.service';
import { PaperAccountsService } from '../src/trading/paper-accounts.service';

function browserProof() {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

function handoffCode(
  result: Awaited<ReturnType<AuthService['handleOAuthCallback']>>,
): string {
  assert.ok(
    'redirect_url' in result,
    'Browser callback must redirect, not issue a bearer token.',
  );
  const fragment = new URLSearchParams(
    new URL(result.redirect_url).hash.slice(1),
  );
  assert.equal(fragment.get('error'), null);
  const code = fragment.get('code');
  assert.ok(code);
  return code;
}

function unauthorized(error: unknown): boolean {
  return error instanceof DomainError && error.code === ErrorCode.UNAUTHORIZED;
}

// Mock only the already-verified provider boundary. This harness tests real
// MySQL persistence/transactions, not Google's/Apple's token validation or setup.
function verifiedIdentity(
  auth: AuthService,
  subject: string,
  email?: string,
): void {
  Object.assign(auth, {
    resolveGoogleIdentity: async () => ({ subject, email }),
    resolveAppleIdentity: async () => ({ subject, email }),
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL)
    throw new Error(
      'DATABASE_URL is required for the MySQL auth recovery smoke.',
    );
  Object.assign(process.env, {
    NODE_ENV: 'development',
    INGESTION_SCHEDULER_ENABLED: 'false',
    LOG_LEVEL: 'silent',
    AUTH_DEV_EMAIL_ENABLED: 'true',
    AUTH_LEGACY_WEBAUTHN_ENABLED: 'true',
    AUTH_OAUTH_BROWSER_CALLBACK_URL:
      'http://localhost:4200/auth/oauth/callback',
    GOOGLE_OAUTH_CLIENT_ID: 'mysql-smoke-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'mysql-smoke-only',
    GOOGLE_OAUTH_REDIRECT_URI:
      'http://localhost:4000/api/auth/oauth/google/callback',
    APPLE_OAUTH_CLIENT_ID: 'mysql-smoke-apple',
    APPLE_OAUTH_TEAM_ID: 'smoke-team',
    APPLE_OAUTH_KEY_ID: 'smoke-key',
    APPLE_OAUTH_PRIVATE_KEY: 'not-used-mocked-provider-boundary',
    APPLE_OAUTH_REDIRECT_URI:
      'http://localhost:4000/api/auth/oauth/apple/callback',
  });
  const apps: INestApplicationContext[] = [];
  const userIds = new Set<string>();
  const states: string[] = [];
  const challengeIds: string[] = [];
  let symbolId: number | undefined;
  let app: INestApplicationContext | undefined;
  const startApp = async () => {
    const started = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    apps.push(started);
    return started;
  };
  const closeApp = async (current: INestApplicationContext) => {
    await current.close();
    apps.splice(apps.indexOf(current), 1);
  };
  try {
    app = await startApp();
    let auth = app.get(AuthService);
    let prisma = app.get(PrismaService);
    assert.equal(prisma.isEnabled, true);
    const suffix = randomUUID();
    const email = `auth-recovery-${suffix}@example.com`;
    const subject = `google-recovery-${suffix}`;
    const original = await auth.register(email, 'Original profile');
    userIds.add(original.user.id);
    await auth.ensurePaperAccountForUser(original.user.id);
    const originalAccount = await app
      .get(PaperAccountsService)
      .getForUser(original.user.id);
    await prisma.paperAccount.update({
      where: { id: originalAccount.id },
      data: { cashBalance: '98765.43' },
    });
    await auth.updateProfileBySessionToken(original.access_token, {
      display_name: '  Persisted profile  ',
    });
    const strategy = await app.get(StrategiesService).create(original.user.id, {
      name: `Recovery ${suffix}`,
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: definition(),
    });
    const symbol = await prisma.symbol.create({
      data: {
        symbol: `REC-${suffix.slice(0, 8)}`.toUpperCase(),
        name: 'Recovery smoke fixture',
        assetType: 'EQUITY',
        exchange: 'TEST',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    symbolId = symbol.id;
    const run = await app.get(BacktestsService).createRun({
      userId: original.user.id,
      strategyId: strategy.id,
      symbolId: symbol.id,
      timeframe: '1d',
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-02T00:00:00Z'),
      initialEquity: 1000,
    });
    const other = await auth.register(`auth-other-${suffix}@example.com`);
    userIds.add(other.user.id);
    verifiedIdentity(auth, subject, email);
    const linkProof = browserProof();
    const link = await auth.createOAuthBrowserStart(
      'google',
      {
        code_challenge: linkProof.code_challenge,
        return_path: '/profile',
      },
      original.access_token,
    );
    states.push(link.state);
    // State itself must survive restart, including its original actor/session.
    await closeApp(app);
    app = await startApp();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    verifiedIdentity(auth, subject, email);
    const linkCode = handoffCode(
      await auth.handleOAuthCallback('google', {
        state: link.state,
        code: 'mock-provider-code',
      }),
    );
    assert.equal(
      auth.getProfileBySessionToken(original.access_token).linked_auth_methods
        .google,
      false,
      'Callback alone cannot attach a recovery identity.',
    );
    // Handoff and profile preferences must also survive a second restart.
    await closeApp(app);
    app = await startApp();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    assert.equal(
      auth.getProfileBySessionToken(original.access_token).display_name,
      'Persisted profile',
    );
    await assert.rejects(
      auth.exchangeOAuthSession(
        { code: linkCode, verifier: browserProof().verifier },
        original.access_token,
      ),
      unauthorized,
    );
    await assert.rejects(
      auth.exchangeOAuthSession(
        { code: linkCode, verifier: linkProof.verifier },
        other.access_token,
      ),
      unauthorized,
    );
    const linked = await auth.exchangeOAuthSession(
      { code: linkCode, verifier: linkProof.verifier },
      original.access_token,
    );
    assert.equal(linked.access_token, original.access_token);
    assert.equal(linked.user.id, original.user.id);
    assert.equal(linked.user.linked_auth_methods.google, true);
    assert.equal(linked.intent, 'link');
    assert.equal(linked.return_path, '/profile');
    await assert.rejects(
      auth.exchangeOAuthSession(
        { code: linkCode, verifier: linkProof.verifier },
        original.access_token,
      ),
      unauthorized,
    );

    await verifyOpaqueIdentifiersAndPruning(
      auth,
      prisma,
      app.get(AuthPersistenceService),
      original.user.id,
      original.access_token,
      suffix,
      states,
      challengeIds,
    );

    // Case variants of a signed subject are separate identities, not recovery
    // aliases. They may coexist because the migration changes the unique key.
    const subjectVariant = subject.toUpperCase();
    assert.equal(
      await app
        .get(AuthPersistenceService)
        .findOAuthUser('google', subjectVariant),
      null,
    );
    verifiedIdentity(
      auth,
      subjectVariant,
      `case-variant-${suffix}@example.com`,
    );
    const variantProof = browserProof();
    const variantStart = await auth.createOAuthBrowserStart('google', {
      code_challenge: variantProof.code_challenge,
      return_path: '/dashboard',
    });
    states.push(variantStart.state);
    const variantCode = handoffCode(
      await auth.handleOAuthCallback('google', {
        state: variantStart.state,
        code: 'mock-case-variant-code',
      }),
    );
    const variantUser = await prisma.oAuthIdentity.findUniqueOrThrow({
      where: {
        provider_subject: { provider: 'google', subject: subjectVariant },
      },
    });
    userIds.add(variantUser.userId);
    const variantLogin = await auth.exchangeOAuthSession({
      code: variantCode,
      verifier: variantProof.verifier,
    });
    assert.equal(variantLogin.user.id, variantUser.userId);
    assert.notEqual(variantLogin.user.id, original.user.id);
    assert.equal(
      await prisma.oAuthIdentity.count({
        where: {
          provider: 'google',
          subject: { in: [subject, subjectVariant] },
        },
      }),
      2,
    );

    // Existing subjects win over changed/colliding email claims on recovery.
    verifiedIdentity(auth, subject, other.user.email);
    const recoveryProof = browserProof();
    const recovery = await auth.createOAuthBrowserStart('google', {
      code_challenge: recoveryProof.code_challenge,
      return_path: `/strategies/${strategy.id}`,
    });
    states.push(recovery.state);
    const recoveryCode = handoffCode(
      await auth.handleOAuthCallback('google', {
        state: recovery.state,
        code: 'mock-recovery-code',
      }),
    );
    await closeApp(app);
    app = await startApp();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    const competingApp = await startApp();
    const competing = await Promise.allSettled([
      auth.exchangeOAuthSession({
        code: recoveryCode,
        verifier: recoveryProof.verifier,
      }),
      competingApp.get(AuthService).exchangeOAuthSession({
        code: recoveryCode,
        verifier: recoveryProof.verifier,
      }),
    ]);
    assert.equal(
      competing.filter((result) => result.status === 'fulfilled').length,
      1,
      'Two API instances must not redeem the same handoff.',
    );
    const winner = competing.find((result) => result.status === 'fulfilled');
    assert.ok(winner && winner.status === 'fulfilled');
    const recovered = winner.value;
    assert.equal(recovered.user.id, original.user.id);
    assert.equal(recovered.user.display_name, 'Persisted profile');
    assert.equal(recovered.return_path, `/strategies/${strategy.id}`);
    assert.equal(recovered.intent, 'login');
    await closeApp(competingApp);
    // Hydration must recognize the winning session whichever instance redeemed.
    await closeApp(app);
    app = await startApp();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    assert.equal(
      auth.getProfileBySessionToken(recovered.access_token).id,
      original.user.id,
    );
    const recoveredAccount = await app
      .get(PaperAccountsService)
      .getForUser(recovered.user.id);
    assert.equal(recoveredAccount.id, originalAccount.id);
    assert.equal(recoveredAccount.cashBalance.toFixed(2), '98765.43');
    assert.equal(
      (await app.get(StrategiesService).getById(recovered.user.id, strategy.id))
        .id,
      strategy.id,
    );
    assert.equal(
      (await app.get(BacktestsService).getRun(run.id, recovered.user.id))?.run
        .id,
      run.id,
    );
    assert.equal(
      await prisma.paperAccount.count({ where: { userId: original.user.id } }),
      1,
    );

    // A second actor cannot steal the subject, even with a matching signed email.
    verifiedIdentity(auth, subject, other.user.email);
    const conflictProof = browserProof();
    const conflict = await auth.createOAuthBrowserStart(
      'google',
      {
        code_challenge: conflictProof.code_challenge,
        return_path: '/profile',
      },
      other.access_token,
    );
    states.push(conflict.state);
    const conflictCode = handoffCode(
      await auth.handleOAuthCallback('google', {
        state: conflict.state,
        code: 'mock-conflict-code',
      }),
    );
    await assert.rejects(
      auth.exchangeOAuthSession(
        { code: conflictCode, verifier: conflictProof.verifier },
        other.access_token,
      ),
      (error: unknown) =>
        error instanceof DomainError && error.code === ErrorCode.CONFLICT,
    );
    assert.equal(
      auth.getProfileBySessionToken(other.access_token).linked_auth_methods
        .google,
      false,
    );
    assert.equal(
      (
        await prisma.oAuthIdentity.findUniqueOrThrow({
          where: { provider_subject: { provider: 'google', subject } },
        })
      ).userId,
      original.user.id,
    );

    // Apple recovery with no repeated email/form metadata still resolves subject.
    const appleSubject = `apple-recovery-${suffix}`;
    verifiedIdentity(auth, appleSubject);
    const appleProof = browserProof();
    const appleLink = await auth.createOAuthBrowserStart(
      'apple',
      { code_challenge: appleProof.code_challenge, return_path: '/profile' },
      recovered.access_token,
    );
    states.push(appleLink.state);
    const appleCode = handoffCode(
      await auth.handleOAuthCallback('apple', {
        state: appleLink.state,
        code: 'mock-apple-code',
      }),
    );
    await auth.exchangeOAuthSession(
      { code: appleCode, verifier: appleProof.verifier },
      recovered.access_token,
    );
    const appleLoginProof = browserProof();
    const appleLogin = await auth.createOAuthBrowserStart('apple', {
      code_challenge: appleLoginProof.code_challenge,
      return_path: '/dashboard',
    });
    states.push(appleLogin.state);
    const appleLoginCode = handoffCode(
      await auth.handleOAuthCallback('apple', {
        state: appleLogin.state,
        code: 'mock-apple-return',
      }),
    );
    assert.equal(
      (
        await auth.exchangeOAuthSession({
          code: appleLoginCode,
          verifier: appleLoginProof.verifier,
        })
      ).user.id,
      original.user.id,
    );

    // Original sign-in age is persisted; restarting never makes old tokens fresh.
    await prisma.authSession.update({
      where: { token: original.access_token },
      data: { createdAt: new Date(Date.now() - 360_000) },
    });
    await closeApp(app);
    app = await startApp();
    auth = app.get(AuthService);
    await assert.rejects(
      auth.createOAuthBrowserStart(
        'google',
        {
          code_challenge: browserProof().code_challenge,
          return_path: '/profile',
        },
        original.access_token,
      ),
      unauthorized,
    );
    assert.equal(
      auth.getProfileBySessionToken(original.access_token).id,
      original.user.id,
      'Old sessions still work for normal profile reads.',
    );
    process.stdout.write(
      'Auth recovery MySQL smoke PASS: persisted state/handoff/profile, verifier and same-session linking, cross-instance one-use redemption, Google/Apple recovery, original account/cash/strategy/backtest ownership, conflict protection, case-sensitive identifiers/subjects, expired ceremony pruning and sign-in age after restart. Provider identity boundary is mocked.\n',
    );
  } finally {
    if (app && app.get(PrismaService).isEnabled) {
      const prisma = app.get(PrismaService);
      try {
        await prisma.$transaction(async (tx) => {
          const ids = [...userIds];
          await tx.oAuthState.deleteMany({ where: { state: { in: states } } });
          await tx.webAuthnChallenge.deleteMany({
            where: { id: { in: challengeIds } },
          });
          await tx.oAuthHandoff.deleteMany({ where: { userId: { in: ids } } });
          await tx.backtestRun.deleteMany({ where: { userId: { in: ids } } });
          await tx.strategyVersion.deleteMany({
            where: { strategy: { userId: { in: ids } } },
          });
          await tx.strategy.deleteMany({ where: { userId: { in: ids } } });
          await tx.paperAccount.deleteMany({ where: { userId: { in: ids } } });
          await tx.auditEvent.deleteMany({ where: { userId: { in: ids } } });
          await tx.webAuthnCredential.deleteMany({
            where: { userId: { in: ids } },
          });
          await tx.user.deleteMany({ where: { id: { in: ids } } });
          if (symbolId) await tx.symbol.delete({ where: { id: symbolId } });
        });
      } finally {
        await Promise.all(apps.map((current) => current.close()));
      }
    } else {
      await Promise.all(apps.map((current) => current.close()));
    }
  }
}

async function verifyOpaqueIdentifiersAndPruning(
  auth: AuthService,
  prisma: PrismaService,
  persistence: AuthPersistenceService,
  userId: string,
  sessionToken: string,
  suffix: string,
  states: string[],
  challengeIds: string[],
): Promise<void> {
  const fixtures = ['expired', 'active'].map((status) => ({
    state: `CaseState-${suffix}-${status}`,
    challengeId: `a${randomUUID().slice(1)}`,
    codeHash: `a${createHash('sha256').update(`${suffix}-${status}`).digest('hex').slice(1)}`,
    expiresAt: new Date(
      Date.now() + (status === 'expired' ? -60_000 : 600_000),
    ),
  }));
  for (const fixture of fixtures) {
    states.push(fixture.state);
    challengeIds.push(fixture.challengeId);
    await prisma.oAuthState.create({
      data: {
        state: fixture.state,
        provider: 'google',
        nonce: `CaseNonce-${suffix}`,
        mode: 'browser',
        intent: 'login',
        codeChallenge: browserProof().code_challenge,
        returnPath: '/dashboard',
        expiresAt: fixture.expiresAt,
        createdAt: new Date(),
      },
    });
    await prisma.webAuthnChallenge.create({
      data: {
        id: fixture.challengeId,
        purpose: 'login',
        email: 'opaque-smoke@example.com',
        challenge: `CaseChallenge-${suffix}`,
        expiresAt: fixture.expiresAt,
        createdAt: new Date(),
      },
    });
    await prisma.oAuthHandoff.create({
      data: {
        codeHash: fixture.codeHash,
        provider: 'google',
        intent: 'login',
        userId,
        codeChallenge: browserProof().code_challenge,
        returnPath: '/dashboard',
        expiresAt: fixture.expiresAt,
        createdAt: new Date(),
      },
    });
  }
  const active = fixtures[1];
  assert.equal(
    await persistence.findOAuthState(active.state.toUpperCase()),
    null,
  );
  assert.equal(
    await persistence.consumeOAuthState(active.state.toUpperCase(), 'google'),
    null,
  );
  assert.equal(
    await prisma.webAuthnChallenge.findUnique({
      where: { id: active.challengeId.toUpperCase() },
    }),
    null,
  );
  assert.equal(
    await prisma.oAuthHandoff.findUnique({
      where: { codeHash: active.codeHash.toUpperCase() },
    }),
    null,
  );
  const tokenVariant = sessionToken.toUpperCase();
  assert.notEqual(tokenVariant, sessionToken);
  assert.equal(await persistence.findSession(tokenVariant), null);
  assert.equal(
    await prisma.authSession.findUnique({ where: { token: tokenVariant } }),
    null,
  );
  const credentialId = `CaseCredential-${suffix}`;
  await prisma.webAuthnCredential.create({
    data: {
      credentialId,
      userId,
      publicKey: 'AQ',
      signCount: 0,
      createdAt: new Date(),
    },
  });
  assert.equal(
    await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credentialId.toUpperCase() },
    }),
    null,
  );

  // A normal OAuth start must remove abandoned expired records, while leaving
  // every live ceremony intact for its rightful browser/credential owner.
  const start = await auth.createOAuthBrowserStart('google', {
    code_challenge: browserProof().code_challenge,
    return_path: '/dashboard',
  });
  states.push(start.state);
  for (const [index, fixture] of fixtures.entries()) {
    const remaining = await Promise.all([
      prisma.oAuthState.findUnique({ where: { state: fixture.state } }),
      prisma.webAuthnChallenge.findUnique({
        where: { id: fixture.challengeId },
      }),
      prisma.oAuthHandoff.findUnique({ where: { codeHash: fixture.codeHash } }),
    ]);
    for (const row of remaining) {
      if (index === 0)
        assert.equal(row, null, 'Expired ceremonies must be pruned.');
      else assert.ok(row, 'Pruning must preserve active ceremonies.');
    }
  }
}

function definition(): StrategyDefinition {
  return {
    indicators: [],
    entry: {
      logic: 'AND',
      conditions: [
        { left: { price: 'close' }, op: 'gt', right: { literal: 0 } },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        { left: { price: 'close' }, op: 'lt', right: { literal: 0 } },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 50 },
      take_profit: { type: 'percent', value: 500 },
    },
  };
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Auth recovery MySQL smoke FAIL: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
