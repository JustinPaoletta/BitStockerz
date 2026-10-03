import { randomBytes } from 'node:crypto';
import {
  hashOAuthSecret,
  oauthVerifierChallenge,
  validateOAuthReturnPath,
} from './oauth-browser.helpers';

describe('OAuth browser helpers', () => {
  it('hashes opaque secrets without persisting the code and computes the browser challenge', () => {
    const verifier = randomBytes(32).toString('base64url');
    expect(hashOAuthSecret(verifier)).toMatch(/^[a-f0-9]{64}$/);
    expect(oauthVerifierChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(oauthVerifierChallenge(verifier)).not.toBe(verifier);
  });
  it.each([
    '/dashboard',
    '/strategies?tab=active#latest',
    '/backtests/abc',
    '/trade',
  ])('allows local routes %s', (path) => {
    expect(validateOAuthReturnPath(path)).toBe(path);
  });
  it.each([
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/%2fevil.test',
    '/%5cevil.test',
    '/%0aevil.test',
    '/%1froute',
    '/%7froute',
    '/ route',
    '/\nroute',
    '/auth/oauth/callback',
    `/${'a'.repeat(2048)}`,
  ])('rejects unsafe destination %s', (path) => {
    expect(() => validateOAuthReturnPath(path)).toThrow();
  });
});
