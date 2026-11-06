import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { PasskeyCredentialRecord, UserRecord } from './auth.records';

function unauthorized(): never {
  throw new DomainError(
    ErrorCode.UNAUTHORIZED,
    'Mobile beta access is unavailable.',
  );
}

export function invitationHash(token: string | undefined): string {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) unauthorized();
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class MobileAdmissionService implements OnModuleInit {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  get enabled(): boolean {
    return this.config.server.privateBetaMobileEnabled === true;
  }

  onModuleInit(): void {
    if (this.enabled && !this.prisma.isEnabled)
      throw new Error('Persistent MySQL is required for mobile admission.');
  }

  async authorizeInvitation(email: string, token?: string): Promise<string> {
    this.requireEnabled();
    const hash = invitationHash(token);
    const row = await this.prisma.mobileInvitation.findUnique({
      where: { tokenHash: hash },
    });
    if (
      !row ||
      row.email !== email ||
      row.consumedAt ||
      row.revokedAt ||
      row.expiresAt.getTime() <= Date.now()
    )
      unauthorized();
    // Challenge creation is not redemption: cancellation leaves this reusable.
    return hash;
  }

  async requireAdmission(userId: string): Promise<void> {
    this.requireEnabled();
    const row = await this.prisma.mobileAdmission.findUnique({
      where: { userId },
      include: { user: { select: { deletedAt: true } } },
    });
    if (!row || row.revokedAt || !row.user || row.user.deletedAt)
      unauthorized();
  }

  async requireSession(token: string | undefined): Promise<void> {
    this.requireEnabled();
    if (!token || !/^[a-f0-9-]{36}$/.test(token)) unauthorized();
    // Do not rely on AuthService's hydrated caches: operator revocation and
    // session deletion must affect the very next request without an API restart.
    const session = await this.prisma.authSession.findUnique({
      where: { token },
      include: { user: { include: { mobileAdmission: true } } },
    });
    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.deletedAt ||
      !session.user.mobileAdmission ||
      session.user.mobileAdmission.revokedAt
    )
      unauthorized();
  }

  async enroll(input: {
    invitationHash: string | undefined;
    user: UserRecord;
    credential: PasskeyCredentialRecord;
    session: { token: string; expiresAt: number; signedInAt: number };
  }): Promise<void> {
    this.requireEnabled();
    const { user, credential, session } = input;
    if (!input.invitationHash || !/^[a-f0-9]{64}$/.test(input.invitationHash))
      unauthorized();
    const now = new Date();
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // Conditional UPDATE locks this invitation. Concurrent challenges can
          // verify cryptographically, but only one can commit an enrollment.
          const claimed = await tx.mobileInvitation.updateMany({
            where: {
              tokenHash: input.invitationHash,
              email: user.email,
              expiresAt: { gt: now },
              consumedAt: null,
              revokedAt: null,
            },
            data: { consumedAt: now, consumedBy: user.id },
          });
          if (claimed.count !== 1) unauthorized();
          await tx.user.create({
            data: {
              id: user.id,
              email: user.email,
              displayName: user.display_name ?? null,
              baseCurrency: user.base_currency,
              createdAt: now,
              updatedAt: now,
            },
          });
          await tx.webAuthnCredential.create({
            data: {
              credentialId: credential.credentialId,
              userId: user.id,
              publicKey: Buffer.from(credential.credential.publicKey).toString(
                'base64url',
              ),
              signCount: BigInt(credential.credential.counter),
              transports: credential.credential.transports?.length
                ? JSON.stringify(credential.credential.transports)
                : null,
              aaguid: credential.aaguid ?? null,
              createdAt: new Date(credential.createdAt),
            },
          });
          await tx.mobileAdmission.create({
            data: { userId: user.id, admittedAt: now },
          });
          await tx.authSession.create({
            data: {
              token: session.token,
              userId: user.id,
              expiresAt: new Date(session.expiresAt),
              createdAt: new Date(session.signedInAt),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new DomainError(
          ErrorCode.CONFLICT,
          'Account or passkey already registered.',
        );
      throw error;
    }
  }

  private requireEnabled(): void {
    if (!this.enabled || !this.prisma.isEnabled) unauthorized();
  }
}
