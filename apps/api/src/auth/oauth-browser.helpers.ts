import { createHash } from 'node:crypto';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';

export function hashOAuthSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function oauthVerifierChallenge(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function validateOAuthReturnPath(value: string): string {
  // Restrict to local routes and reject URL parser normalization tricks.
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.length > 2048 ||
    Array.from(value).some(
      (char) =>
        char === '\\' ||
        /\s/.test(char) ||
        char.charCodeAt(0) < 32 ||
        char.charCodeAt(0) === 127,
    ) ||
    /%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(value)
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      'return_path must be a local application path.',
    );
  }
  const url = new URL(value, 'https://bitstockerz.invalid');
  if (
    url.origin !== 'https://bitstockerz.invalid' ||
    url.pathname === '/auth/oauth/callback'
  ) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      'return_path is invalid.',
    );
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
