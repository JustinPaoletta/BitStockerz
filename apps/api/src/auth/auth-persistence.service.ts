import { Injectable, Logger } from '@nestjs/common';
import type { WebAuthnCredential } from '@simplewebauthn/server';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuthMemorySnapshot,
  OauthStateRecord,
  PasskeyCredentialRecord,
  SessionRecord,
  UserRecord,
  WebAuthnChallengeRecord,
  WebAuthnChallengePurpose,
} from './auth.records';
import type { BaseCurrency, OauthProvider } from './auth.records';

function encodePublicKey(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function decodePublicKey(encoded: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(encoded, 'base64url'));
}

function encodeTransports(
  transports: WebAuthnCredential['transports'],
): string | null {
  if (!transports || transports.length === 0) {
    return null;
  }
  return JSON.stringify(transports);
}

function decodeTransports(
  raw: string | null | undefined,
): WebAuthnCredential['transports'] {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? (parsed as WebAuthnCredential['transports'])
      : undefined;
  } catch {
    return undefined;
  }
}

@Injectable()
export class AuthPersistenceService {
  private readonly logger = new Logger(AuthPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  get enabled(): boolean {
    return this.prisma.isEnabled;
  }

  async hydrate(snapshot: AuthMemorySnapshot): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    const now = new Date();
    const [users, sessions] = await Promise.all([
      this.prisma.user.findMany({
        include: {
          webauthnCredentials: true,
          oauthIdentities: true,
        },
      }),
      this.prisma.authSession.findMany({
        where: { expiresAt: { gt: now } },
      }),
    ]);

    for (const row of users) {
      const user: UserRecord = {
        id: row.id,
        email: row.email,
        display_name: row.displayName ?? undefined,
        base_currency: (row.baseCurrency as BaseCurrency) ?? 'USD',
        passkeyCredentialIds: new Set<string>(),
      };

      for (const credential of row.webauthnCredentials) {
        const record = this.toCredentialRecord(credential);
        snapshot.credentialsById.set(record.credentialId, record);
        user.passkeyCredentialIds.add(record.credentialId);
      }

      for (const identity of row.oauthIdentities) {
        if (identity.provider === 'google') {
          user.googleSubject = identity.subject;
          snapshot.googleSubjectsToUserIds.set(identity.subject, user.id);
        } else if (identity.provider === 'apple') {
          user.appleSubject = identity.subject;
          snapshot.appleSubjectsToUserIds.set(identity.subject, user.id);
        }
      }

      snapshot.usersByEmail.set(user.email, user);
      snapshot.usersById.set(user.id, user);
    }

    for (const session of sessions) {
      snapshot.sessions.set(session.token, {
        userId: session.userId,
        expiresAt: session.expiresAt.getTime(),
      });
    }

    await Promise.all([
      this.prisma.authSession.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.webAuthnChallenge.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      this.prisma.oAuthState.deleteMany({ where: { expiresAt: { lte: now } } }),
    ]);
  }

  async saveUser(user: UserRecord): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    const now = new Date();
    await this.prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.display_name ?? null,
        baseCurrency: user.base_currency,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        email: user.email,
        displayName: user.display_name ?? null,
        baseCurrency: user.base_currency,
        updatedAt: now,
      },
    });
  }

  async updateUserProfile(user: UserRecord): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: user.display_name ?? null,
        baseCurrency: user.base_currency,
        updatedAt: new Date(),
      },
    });
  }

  async saveSession(
    token: string,
    userId: string,
    expiresAtMs: number,
  ): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    const now = new Date();
    await this.prisma.authSession.create({
      data: {
        token,
        userId,
        expiresAt: new Date(expiresAtMs),
        createdAt: now,
      },
    });
  }

  async deleteSession(token: string): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.authSession.deleteMany({ where: { token } });
  }

  async saveCredential(record: PasskeyCredentialRecord): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.webAuthnCredential.create({
      data: {
        credentialId: record.credentialId,
        userId: record.userId,
        publicKey: encodePublicKey(record.credential.publicKey),
        signCount: BigInt(record.credential.counter),
        transports: encodeTransports(record.credential.transports),
        aaguid: record.aaguid ?? null,
        createdAt: new Date(record.createdAt),
      },
    });
  }

  async updateCredentialCounter(
    credentialId: string,
    counter: number,
  ): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.webAuthnCredential.update({
      where: { credentialId },
      data: { signCount: BigInt(counter) },
    });
  }

  async saveOAuthIdentity(
    provider: OauthProvider,
    subject: string,
    userId: string,
    email?: string,
  ): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.oAuthIdentity.upsert({
      where: {
        provider_subject: { provider, subject },
      },
      create: {
        provider,
        subject,
        userId,
        email: email ?? null,
        createdAt: new Date(),
      },
      update: {
        userId,
        email: email ?? null,
      },
    });
  }

  async saveWebAuthnChallenge(
    record: WebAuthnChallengeRecord,
  ): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.webAuthnChallenge.create({
      data: {
        id: record.challengeId,
        purpose: record.purpose,
        email: record.email,
        challenge: record.challenge,
        expiresAt: new Date(record.expiresAt),
        createdAt: new Date(),
      },
    });
  }

  async consumeWebAuthnChallenge(
    challengeId: string,
    purpose: WebAuthnChallengePurpose,
    email: string,
  ): Promise<WebAuthnChallengeRecord | null> {
    if (!this.prisma.isEnabled) {
      return null;
    }

    const row = await this.prisma.webAuthnChallenge.findUnique({
      where: { id: challengeId },
    });
    if (!row) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.webAuthnChallenge.delete({ where: { id: challengeId } });
      return null;
    }

    if (row.purpose !== purpose || row.email !== email) {
      return null;
    }

    await this.prisma.webAuthnChallenge.delete({ where: { id: challengeId } });

    return {
      challengeId: row.id,
      purpose: row.purpose as WebAuthnChallengePurpose,
      email: row.email,
      challenge: row.challenge,
      expiresAt: row.expiresAt.getTime(),
    };
  }

  async saveOAuthState(record: OauthStateRecord): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.oAuthState.create({
      data: {
        state: record.state,
        provider: record.provider,
        nonce: record.nonce,
        expiresAt: new Date(record.expiresAt),
        createdAt: new Date(),
      },
    });
  }

  async consumeOAuthState(
    state: string,
    provider: OauthProvider,
  ): Promise<OauthStateRecord | null> {
    if (!this.prisma.isEnabled) {
      return null;
    }

    const row = await this.prisma.oAuthState.findUnique({ where: { state } });
    if (!row) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.oAuthState.delete({ where: { state } });
      return null;
    }

    if (row.provider !== provider) {
      return null;
    }

    await this.prisma.oAuthState.delete({ where: { state } });

    return {
      state: row.state,
      provider: row.provider as OauthProvider,
      nonce: row.nonce,
      expiresAt: row.expiresAt.getTime(),
    };
  }

  async findSession(token: string): Promise<SessionRecord | null> {
    if (!this.prisma.isEnabled) {
      return null;
    }

    const row = await this.prisma.authSession.findUnique({ where: { token } });
    if (!row) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.deleteMany({ where: { token } });
      return null;
    }

    return {
      userId: row.userId,
      expiresAt: row.expiresAt.getTime(),
    };
  }

  async ensureUserExists(userId: string): Promise<boolean> {
    if (!this.prisma.isEnabled) {
      return false;
    }

    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    return Boolean(row);
  }

  private toCredentialRecord(
    row: Prisma.WebAuthnCredentialGetPayload<object>,
  ): PasskeyCredentialRecord {
    return {
      credentialId: row.credentialId,
      userId: row.userId,
      credential: {
        id: row.credentialId,
        publicKey: decodePublicKey(row.publicKey),
        counter: Number(row.signCount),
        transports: decodeTransports(row.transports),
      },
      aaguid: row.aaguid ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
