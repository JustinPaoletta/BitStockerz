import 'reflect-metadata';
import assert from 'node:assert/strict';
import { AuthService } from '../src/auth/auth.service';
import { AuthPersistenceService } from '../src/auth/auth-persistence.service';
import type { AppConfigService } from '../src/config/app-config.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { DomainError } from '../src/common/errors/domain-error';
import { ErrorCode } from '../src/common/errors/error-codes.enum';
import type { JWTPayload } from 'jose';

interface ProviderVerifiers {
  verifyGoogleIdToken(token: string, nonce: string): Promise<JWTPayload>;
  verifyAppleIdToken(token: string, nonce: string): Promise<JWTPayload>;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DomainError && error.code === ErrorCode.UNAUTHORIZED;
}

async function main(): Promise<void> {
  // Run under native Node rather than Jest's VM so the installed jose ESM module
  // executes normally. Only public key discovery is local; production verifier
  // methods, signature verification and claim checks are all real.
  const { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } =
    await import('jose');
  const keys = await generateKeyPair('RS256');
  const unrelatedKeys = await generateKeyPair('RS256');
  const unsupportedAlgorithmKeys = await generateKeyPair('RS512');
  const publicJwk = await exportJWK(keys.publicKey);
  const localJwks = createLocalJWKSet({
    keys: [
      { ...publicJwk, kid: 'local-provider-key', alg: 'RS256', use: 'sig' },
    ],
  });
  const config = {
    server: { nodeEnv: 'production' },
    auth: { googleClientId: 'google-client', appleClientId: 'apple-client' },
  } as AppConfigService;
  const prisma = { isEnabled: false } as PrismaService;
  const auth = new AuthService(
    config,
    prisma,
    new AuthPersistenceService(prisma),
  );
  Object.assign(auth, { googleJwks: localJwks, appleJwks: localJwks });
  const verifiers = auth as unknown as ProviderVerifiers;
  const nonce = 'original-request-nonce';
  let checks = 0;

  for (const provider of ['google', 'apple'] as const) {
    const verify =
      provider === 'google'
        ? verifiers.verifyGoogleIdToken.bind(auth)
        : verifiers.verifyAppleIdToken.bind(auth);
    const now = Math.floor(Date.now() / 1000);
    const claims: JWTPayload = {
      iss:
        provider === 'google'
          ? 'https://accounts.google.com'
          : 'https://appleid.apple.com',
      aud: `${provider}-client`,
      sub: `${provider}-stable-subject`,
      iat: now,
      exp: now + 300,
      nonce,
    };
    const sign = (payload: JWTPayload) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'local-provider-key' })
        .sign(keys.privateKey);
    const valid = await sign(claims);
    assert.equal((await verify(valid, nonce)).sub, claims.sub);
    checks++;
    if (provider === 'google') {
      assert.equal(
        (
          await verify(
            await sign({ ...claims, iss: 'accounts.google.com' }),
            nonce,
          )
        ).sub,
        claims.sub,
      );
      checks++;
    }

    const rejectClaims = async (payload: JWTPayload, description: string) => {
      const token = await sign(payload);
      await assert.rejects(
        () => verify(token, nonce),
        isUnauthorized,
        description,
      );
      checks++;
    };
    for (const missing of ['sub', 'exp', 'iat', 'nonce'] as const) {
      const payload = { ...claims };
      delete payload[missing];
      await rejectClaims(payload, `${provider} must reject missing ${missing}`);
    }
    await rejectClaims(
      { ...claims, nonce: 'another-request-nonce' },
      `${provider} must reject a mismatched nonce`,
    );
    await rejectClaims(
      { ...claims, nonce: null },
      `${provider} must reject a null nonce`,
    );
    await rejectClaims(
      { ...claims, exp: now - 60 },
      `${provider} must reject expired signed tokens`,
    );
    await rejectClaims(
      { ...claims, nbf: now + 300 },
      `${provider} must reject a token that is not yet valid`,
    );
    await rejectClaims(
      { ...claims, iss: 'https://untrusted-provider.example' },
      `${provider} must reject an incorrect issuer`,
    );
    await rejectClaims(
      { ...claims, aud: 'another-client' },
      `${provider} must reject an incorrect audience`,
    );
    const wrongKeyToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'local-provider-key' })
      .sign(unrelatedKeys.privateKey);
    await assert.rejects(
      () => verify(wrongKeyToken, nonce),
      isUnauthorized,
      `${provider} must reject a signature from an unrelated key`,
    );
    checks++;
    const components = valid.split('.');
    components[2] =
      (components[2][0] === 'A' ? 'B' : 'A') + components[2].slice(1);
    await assert.rejects(
      () => verify(components.join('.'), nonce),
      isUnauthorized,
      `${provider} must reject a tampered signature`,
    );
    checks++;
    const unsupportedAlgorithm = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS512', kid: 'local-provider-key' })
      .sign(unsupportedAlgorithmKeys.privateKey);
    await assert.rejects(
      () => verify(unsupportedAlgorithm, nonce),
      isUnauthorized,
      `${provider} must reject an algorithm outside the allowlist`,
    );
    checks++;
  }
  process.stdout.write(`Signed OAuth token checks PASS (${checks} checks).\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Signed OAuth token checks FAIL: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
