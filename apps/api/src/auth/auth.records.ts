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
}

export interface AuthMemorySnapshot {
  usersByEmail: Map<string, UserRecord>;
  usersById: Map<string, UserRecord>;
  sessions: Map<string, SessionRecord>;
  credentialsById: Map<string, PasskeyCredentialRecord>;
  googleSubjectsToUserIds: Map<string, string>;
  appleSubjectsToUserIds: Map<string, string>;
}
