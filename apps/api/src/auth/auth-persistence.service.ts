import { Injectable } from '@nestjs/common';
import type { WebAuthnCredential } from '@simplewebauthn/server';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AuthMemorySnapshot,
  OauthStateRecord,
  OAuthHandoffRecord,
  PasskeyCredentialRecord,
  SessionRecord,
  UserRecord,
  WebAuthnChallengeRecord,
  WebAuthnChallengePurpose,
} from './auth.records';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { hashOAuthSecret } from './oauth-browser.helpers';
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
        signedInAt: session.createdAt.getTime(),
      });
    }

    await Promise.all([
      this.prisma.authSession.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      this.pruneOAuthHandoffs(),
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
    signedInAtMs = Date.now(),
  ): Promise<void> {
    if (!this.prisma.isEnabled) {
      return;
    }

    await this.prisma.authSession.create({
      data: {
        token,
        userId,
        expiresAt: new Date(expiresAtMs),
        createdAt: new Date(signedInAtMs),
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

    const known = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
    });
    if (
      known &&
      (known.userId !== userId ||
        known.provider !== provider ||
        known.subject !== subject)
    ) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'This provider identity is already owned by an account.',
      );
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
        email: email ?? null,
      },
    });
  }

  async saveWebAuthnChallenge(record: WebAuthnChallengeRecord): Promise<void> {
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
    if (!row || row.id !== challengeId) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.webAuthnChallenge.delete({
        where: { id: challengeId },
      });
      return null;
    }

    if (row.purpose !== purpose || row.email !== email) {
      return null;
    }

    await this.prisma.webAuthnChallenge.delete({ where: { id: challengeId } });

    return {
      challengeId: row.id,
      purpose: row.purpose,
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
        mode: record.mode ?? 'json',
        intent: record.intent ?? 'login',
        codeChallenge: record.codeChallenge,
        returnPath: record.returnPath,
        initiatingUserId: record.initiatingUserId,
        initiatingSessionHash: record.initiatingSessionHash,
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
    if (
      !row ||
      row.state !== state ||
      row.provider !== provider ||
      row.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    // Conditional deletion is the atomic claim: two callbacks cannot both win.
    const claimed = await this.prisma.oAuthState.deleteMany({
      where: { state, provider, expiresAt: { gt: new Date() } },
    });
    if (claimed.count !== 1) return null;
    return this.toOAuthState(row);
  }

  async findOAuthState(state: string): Promise<OauthStateRecord | null> {
    if (!this.enabled) return null;
    const row = await this.prisma.oAuthState.findUnique({ where: { state } });
    return row?.state === state ? this.toOAuthState(row) : null;
  }

  private toOAuthState(
    row: Prisma.OAuthStateGetPayload<object>,
  ): OauthStateRecord | null {
    if (row.provider !== 'google' && row.provider !== 'apple') return null;
    return {
      state: row.state,
      provider: row.provider,
      nonce: row.nonce,
      expiresAt: row.expiresAt.getTime(),
      mode: row.mode as 'json' | 'browser',
      intent: row.intent as 'login' | 'link',
      codeChallenge: row.codeChallenge ?? undefined,
      returnPath: row.returnPath ?? undefined,
      initiatingUserId: row.initiatingUserId ?? undefined,
      initiatingSessionHash: row.initiatingSessionHash ?? undefined,
    };
  }

  async findSession(token: string): Promise<SessionRecord | null> {
    if (!this.prisma.isEnabled) {
      return null;
    }

    const row = await this.prisma.authSession.findUnique({ where: { token } });
    if (!row || row.token !== token) {
      return null;
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.deleteMany({ where: { token } });
      return null;
    }

    return {
      userId: row.userId,
      expiresAt: row.expiresAt.getTime(),
      signedInAt: row.createdAt.getTime(),
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

  async pruneOAuthHandoffs(): Promise<void> {
    if (!this.enabled) return;
    // Called at startup and OAuth starts, so abandoned ceremonies cannot build
    // up indefinitely on an API process that runs without restarting.
    const where = { expiresAt: { lte: new Date() } };
    await Promise.all([
      this.prisma.oAuthHandoff.deleteMany({ where }),
      this.prisma.oAuthState.deleteMany({ where }),
      this.prisma.webAuthnChallenge.deleteMany({ where }),
    ]);
  }

  private userRecord(
    row: Prisma.UserGetPayload<{
      include: { webauthnCredentials: true; oauthIdentities: true };
    }>,
  ): UserRecord {
    return {
      id: row.id,
      email: row.email,
      display_name: row.displayName ?? undefined,
      base_currency: row.baseCurrency as BaseCurrency,
      passkeyCredentialIds: new Set(
        row.webauthnCredentials.map((item) => item.credentialId),
      ),
      googleSubject: row.oauthIdentities.find(
        (item) => item.provider === 'google',
      )?.subject,
      appleSubject: row.oauthIdentities.find(
        (item) => item.provider === 'apple',
      )?.subject,
    };
  }

  async findOAuthUser(
    provider: OauthProvider,
    subject: string,
  ): Promise<UserRecord | null> {
    const identity = await this.prisma.oAuthIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: {
        user: { include: { webauthnCredentials: true, oauthIdentities: true } },
      },
    });
    return identity?.provider === provider && identity.subject === subject
      ? this.userRecord(identity.user)
      : null;
  }

  private handoffData(record: OAuthHandoffRecord) {
    return {
      ...record,
      expiresAt: new Date(record.expiresAt),
      createdAt: new Date(),
    };
  }

  async saveOAuthHandoff(record: OAuthHandoffRecord): Promise<void> {
    await this.prisma.oAuthHandoff.create({ data: this.handoffData(record) });
  }

  /** Transactionally provisions one identity and one paper account. Unique subject
   * collisions retry against the winning user, never creating an orphan user. */
  async resolveOAuthUser(
    provider: OauthProvider,
    identity: { subject: string; email?: string },
    startingBalance: string,
    handoff?: OAuthHandoffRecord,
  ): Promise<UserRecord> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const known = await tx.oAuthIdentity.findUnique({
            where: {
              provider_subject: { provider, subject: identity.subject },
            },
          });
          if (
            known &&
            (known.provider !== provider || known.subject !== identity.subject)
          ) {
            throw new DomainError(
              ErrorCode.UNAUTHORIZED,
              'Provider identity could not be verified.',
            );
          }
          let userId = known?.userId;
          if (!userId) {
            if (!identity.email)
              throw new DomainError(
                ErrorCode.UNAUTHORIZED,
                'A verified provider email is required for signup.',
              );
            if (
              await tx.user.findUnique({ where: { email: identity.email } })
            ) {
              throw new DomainError(
                ErrorCode.CONFLICT,
                'Sign in to the existing account and link this provider in account settings.',
              );
            }
            userId = randomUUID();
            const now = new Date();
            await tx.user.create({
              data: {
                id: userId,
                email: identity.email,
                baseCurrency: 'USD',
                createdAt: now,
                updatedAt: now,
                oauthIdentities: {
                  create: {
                    provider,
                    subject: identity.subject,
                    email: identity.email,
                    createdAt: now,
                  },
                },
                paperAccount: {
                  create: {
                    name: 'Paper Account',
                    baseCurrency: 'USD',
                    startingBalance,
                    cashBalance: startingBalance,
                    createdAt: now,
                    updatedAt: now,
                  },
                },
              },
            });
          }
          if (handoff)
            await tx.oAuthHandoff.create({
              data: this.handoffData({ ...handoff, userId }),
            });
          const row = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            include: { webauthnCredentials: true, oauthIdentities: true },
          });
          return this.userRecord(row);
        });
      } catch (error) {
        const code = this.prismaErrorCode(error);
        if (attempt < 3 && (code === 'P2002' || code === 'P2034')) continue;
        if (code === 'P2002')
          throw new DomainError(
            ErrorCode.CONFLICT,
            'Provider identity conflicts with an existing account.',
          );
        throw error;
      }
    }
  }

  async redeemOAuthHandoff(
    codeHash: string,
    codeChallenge: string,
    sessionToken: string | undefined,
    loginSession: { token: string; expiresAt: number; signedInAt: number },
  ): Promise<{ user: UserRecord; handoff: OAuthHandoffRecord }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.oAuthHandoff.findUnique({ where: { codeHash } });
        if (
          !row ||
          row.codeHash !== codeHash ||
          row.expiresAt.getTime() <= Date.now() ||
          row.codeChallenge !== codeChallenge
        ) {
          throw new DomainError(
            ErrorCode.UNAUTHORIZED,
            'OAuth handoff is invalid or expired.',
          );
        }
        if (row.intent === 'link') {
          const session = sessionToken
            ? await tx.authSession.findUnique({
                where: { token: sessionToken },
              })
            : null;
          if (
            !session ||
            session.token !== sessionToken ||
            session.userId !== row.userId ||
            session.expiresAt.getTime() <= Date.now() ||
            hashOAuthSecret(sessionToken) !== row.initiatingSessionHash ||
            session.createdAt.getTime() < Date.now() - 300_000
          ) {
            throw new DomainError(
              ErrorCode.UNAUTHORIZED,
              'Sign in again before linking this provider.',
            );
          }
          const existing = await tx.oAuthIdentity.findUnique({
            where: {
              provider_subject: {
                provider: row.provider,
                subject: row.subject!,
              },
            },
          });
          const method = await tx.oAuthIdentity.findUnique({
            where: {
              userId_provider: { userId: row.userId, provider: row.provider },
            },
          });
          if (
            (existing &&
              (existing.userId !== row.userId ||
                existing.provider !== row.provider ||
                existing.subject !== row.subject)) ||
            (method && method.subject !== row.subject)
          ) {
            throw new DomainError(
              ErrorCode.CONFLICT,
              'This provider is already linked to an account.',
            );
          }
          if (!existing)
            await tx.oAuthIdentity.create({
              data: {
                provider: row.provider,
                subject: row.subject!,
                userId: row.userId,
                email: row.email,
                createdAt: new Date(),
              },
            });
        } else {
          await tx.authSession.create({
            data: {
              token: loginSession.token,
              userId: row.userId,
              expiresAt: new Date(loginSession.expiresAt),
              createdAt: new Date(loginSession.signedInAt),
            },
          });
        }
        const claimed = await tx.oAuthHandoff.deleteMany({
          where: { codeHash, expiresAt: { gt: new Date() } },
        });
        if (claimed.count !== 1)
          throw new DomainError(
            ErrorCode.UNAUTHORIZED,
            'OAuth handoff has already been used.',
          );
        const user = await tx.user.findUniqueOrThrow({
          where: { id: row.userId },
          include: { webauthnCredentials: true, oauthIdentities: true },
        });
        return {
          user: this.userRecord(user),
          handoff: {
            codeHash,
            userId: row.userId,
            provider: row.provider as OauthProvider,
            intent: row.intent as 'login' | 'link',
            codeChallenge,
            returnPath: row.returnPath,
            expiresAt: row.expiresAt.getTime(),
          },
        };
      });
    } catch (error) {
      const code = this.prismaErrorCode(error);
      if (code === 'P2002')
        throw new DomainError(
          ErrorCode.CONFLICT,
          'This provider is already linked to an account.',
        );
      if (code === 'P2034')
        throw new DomainError(
          ErrorCode.UNAUTHORIZED,
          'OAuth handoff has already been used.',
        );
      throw error;
    }
  }

  private prismaErrorCode(error: unknown): string | undefined {
    return typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
      ? error.code
      : undefined;
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
