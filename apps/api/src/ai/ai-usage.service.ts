import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { utcDateKey, utcDateOnly } from './ai.types';

@Injectable()
export class AiUsageService {
  private readonly memory = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  /** Atomically consume one call for the user/UTC day or throw AI_RATE_LIMIT. */
  async consume(userId: string): Promise<number> {
    const limit = this.config.ai.dailyCallLimit;
    if (this.prisma.isEnabled) {
      return this.consumePrisma(userId, limit);
    }
    return this.consumeMemory(userId, limit);
  }

  /** Test helper — clear in-memory counters. */
  resetMemory(): void {
    this.memory.clear();
  }

  private consumeMemory(userId: string, limit: number): number {
    const key = `${userId}:${utcDateKey()}`;
    const next = (this.memory.get(key) ?? 0) + 1;
    if (next > limit) {
      throw new DomainError(
        ErrorCode.AI_RATE_LIMIT,
        `Daily Kernel AI call limit of ${limit} exceeded.`,
      );
    }
    this.memory.set(key, next);
    return next;
  }

  private async consumePrisma(userId: string, limit: number): Promise<number> {
    await this.auth.ensureUserPersisted(userId);
    const date = utcDateOnly();

    const calls = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.aiUsage.findUnique({
        where: { userId_date: { userId, date } },
      });

      if (!existing) {
        const created = await tx.aiUsage.create({
          data: { userId, date, calls: 1 },
        });
        return created.calls;
      }

      if (existing.calls >= limit) {
        throw new DomainError(
          ErrorCode.AI_RATE_LIMIT,
          `Daily Kernel AI call limit of ${limit} exceeded.`,
        );
      }

      const updated = await tx.aiUsage.update({
        where: { userId_date: { userId, date } },
        data: { calls: { increment: 1 } },
      });
      return updated.calls;
    });

    if (calls > limit) {
      throw new DomainError(
        ErrorCode.AI_RATE_LIMIT,
        `Daily Kernel AI call limit of ${limit} exceeded.`,
      );
    }

    return calls;
  }
}
