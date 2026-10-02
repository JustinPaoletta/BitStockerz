import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { AuthService } from '../dist/src/auth/auth.service.js';

const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256' }],
});
const auth = new AuthService(
  { auth: { googleClientId: 'client', appleClientId: 'client' } },
  { isEnabled: false },
  { enabled: false },
);
auth.getGoogleJwks = async () => jwks;
auth.getAppleJwks = async () => jwks;

for (const [provider, issuer] of [
  ['Google', 'https://accounts.google.com'],
  ['Apple', 'https://appleid.apple.com'],
]) {
  for (const scenario of [
    'valid',
    'missing nonce',
    'wrong nonce',
    'missing expiry',
    'expired',
    'missing subject',
    'wrong audience',
    'wrong issuer',
  ]) {
    test(`${provider} signed token: ${scenario}`, async () => {
      const claims = {
        sub: 'owner',
        iss: issuer,
        aud: 'client',
        nonce: 'expected',
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      if (scenario === 'missing nonce') delete claims.nonce;
      if (scenario === 'wrong nonce') claims.nonce = 'other';
      if (scenario === 'missing expiry') delete claims.exp;
      if (scenario === 'expired') claims.exp = 1;
      if (scenario === 'missing subject') delete claims.sub;
      if (scenario === 'wrong audience') claims.aud = 'other';
      if (scenario === 'wrong issuer') claims.iss = 'https://attacker.example';
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .sign(privateKey);
      const verification = auth[`verify${provider}IdToken`](token, 'expected');
      if (scenario === 'valid') assert.equal((await verification).sub, 'owner');
      else await assert.rejects(verification, { code: 'UNAUTHORIZED' });
    });
  }
}
