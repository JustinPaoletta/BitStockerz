import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AiUsageService } from '../src/ai/ai-usage.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  assert.ok(process.env.DATABASE_URL, 'Use an isolated MySQL database');
  process.env.AI_DAILY_CALL_LIMIT = '3';
  process.env.INGESTION_SCHEDULER_ENABLED = 'false';
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
    const start = await auth.createOAuthStart('google');
    const linked = await auth.completeGoogleOAuth({
      state: start.state,
      code: 'dev',
      sub: `security-${userId}`,
      email: registration.user.email,
    });
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
