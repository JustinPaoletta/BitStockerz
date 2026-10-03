import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AiUsageService } from '../src/ai/ai-usage.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  assert.ok(process.env.DATABASE_URL, 'Use an isolated MySQL database');
  process.env.AI_DAILY_CALL_LIMIT = '3';
  process.env.INGESTION_SCHEDULER_ENABLED = 'false';
  process.env.AUTH_OAUTH_BROWSER_CALLBACK_URL =
    'http://localhost:4200/auth/oauth/callback';
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'mysql-smoke-client';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'mysql-smoke-only';
  process.env.GOOGLE_OAUTH_REDIRECT_URI =
    'http://localhost:4000/api/auth/oauth/google/callback';
  let app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  let userId: string | undefined;
  try {
    const auth = app.get(AuthService);
    const registration = await auth.register(
      `security-${crypto.randomUUID()}@example.com`,
    );
    userId = registration.user.id;
    // Mock only the verified-provider boundary; signed JWTs have a separate
    // native verifier suite. Exercise the real DB linking transaction here.
    Object.assign(auth, {
      resolveGoogleIdentity: async () => ({
        subject: `security-${userId}`,
        email: registration.user.email,
      }),
    });
    const collision = await auth.createOAuthStart('google');
    await assert.rejects(
      auth.completeGoogleOAuth({ state: collision.state, code: 'mock-code' }),
      { code: 'CONFLICT' },
    );
    assert.equal(
      auth.getProfileBySessionToken(registration.access_token)
        .linked_auth_methods.google,
      false,
    );
    const verifier = randomBytes(32).toString('base64url');
    const start = await auth.createOAuthBrowserStart(
      'google',
      {
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        return_path: '/profile',
      },
      registration.access_token,
    );
    const callback = await auth.handleOAuthCallback('google', {
      state: start.state,
      code: 'mock-code',
    });
    assert.ok('redirect_url' in callback);
    const fragment = new URLSearchParams(
      new URL(callback.redirect_url).hash.slice(1),
    );
    assert.equal(fragment.get('error'), null);
    assert.equal(fragment.get('state'), start.state);
    const code = fragment.get('code');
    assert.ok(code);
    const linked = await auth.exchangeOAuthSession(
      { code, verifier },
      registration.access_token,
    );
    assert.equal(linked.intent, 'link');
    assert.equal(linked.access_token, registration.access_token);
    assert.equal(linked.user.id, userId);
    await app.close();
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const restartedAuth = app.get(AuthService);
    assert.equal(
      restartedAuth.getProfileBySessionToken(registration.access_token).id,
      userId,
    );
    assert.equal(
      restartedAuth.getProfileBySessionToken(registration.access_token)
        .linked_auth_methods.google,
      true,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        app.get(AiUsageService).consume(userId!),
      ),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 3);
    for (const result of results) {
      if (result.status === 'rejected')
        assert.equal((result.reason as { code: string }).code, 'AI_RATE_LIMIT');
    }
    assert.equal(
      (
        await app
          .get(PrismaService)
          .$transaction((tx) =>
            tx.aiUsage.findFirstOrThrow({ where: { userId } }),
          )
      ).calls,
      3,
    );
    await restartedAuth.logout(registration.access_token);
    await app.close();
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    assert.throws(
      () =>
        app
          .get(AuthService)
          .getProfileBySessionToken(registration.access_token),
      { code: 'UNAUTHORIZED' },
    );
    console.log(
      'Auth restart/link/logout and concurrent AI quota MySQL checks PASS',
    );
  } finally {
    try {
      if (userId) {
        const db = app.get(PrismaService);
        await db.$transaction((tx) =>
          tx.aiUsage.deleteMany({ where: { userId } }),
        );
        await db.auditEvent.deleteMany({ where: { userId } });
        await db.webAuthnCredential.deleteMany({ where: { userId } });
        await db.paperAccount.deleteMany({ where: { userId } });
        await db.user.delete({ where: { id: userId } });
      }
    } finally {
      await app.close();
    }
  }
}
void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
