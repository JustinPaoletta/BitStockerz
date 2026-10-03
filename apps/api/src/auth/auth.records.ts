import type { WebAuthnCredential } from '@simplewebauthn/server';

export type BaseCurrency = 'USD';
export type OauthProvider = 'google' | 'apple';
export type WebAuthnChallengePurpose = 'register' | 'login';

export interface UserRecord {
  id: string;
  email: string;
  display_name?: string;
  base_currency: BaseCurrency;
  passkeyCredentialIds: Set<string>;
  googleSubject?: string;
  appleSubject?: string;
}

export interface SessionRecord {
  userId: string;
  expiresAt: number;
  signedInAt?: number;
}

export interface PasskeyCredentialRecord {
  credentialId: string;
  userId: string;
  credential: WebAuthnCredential;
  aaguid?: string;
  createdAt: string;
}

export interface WebAuthnChallengeRecord {
  challengeId: string;
  purpose: WebAuthnChallengePurpose;
  email: string;
  challenge: string;
  expiresAt: number;
}

export interface OauthStateRecord {
  state: string;
  provider: OauthProvider;
  nonce: string;
  expiresAt: number;
  mode?: 'json' | 'browser';
  intent?: 'login' | 'link';
  codeChallenge?: string;
  returnPath?: string;
  initiatingUserId?: string;
  initiatingSessionHash?: string;
}

export interface AuthMemorySnapshot {
  usersByEmail: Map<string, UserRecord>;
  usersById: Map<string, UserRecord>;
  sessions: Map<string, SessionRecord>;
  credentialsById: Map<string, PasskeyCredentialRecord>;
  googleSubjectsToUserIds: Map<string, string>;
  appleSubjectsToUserIds: Map<string, string>;
}

export interface OAuthHandoffRecord {
  codeHash: string;
  userId: string;
  provider: OauthProvider;
  intent: 'login' | 'link';
  subject?: string;
  email?: string;
  codeChallenge: string;
  returnPath: string;
  initiatingSessionHash?: string;
  expiresAt: number;
}
