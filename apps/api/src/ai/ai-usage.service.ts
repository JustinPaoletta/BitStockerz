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
      // Create the counter once, then increment only while below the cap.
      // A read followed by an unconditional increment races across requests.
      // Native MySQL upsert takes an exclusive row lock, including when the
      // counter exists. INSERT IGNORE can deadlock on a shared-lock upgrade.
      await tx.$executeRaw`
        INSERT INTO ai_usage (user_id, date, calls) VALUES (${userId}, ${date}, 0)
        ON DUPLICATE KEY UPDATE calls = calls
      `;
      const updated = await tx.aiUsage.updateMany({
        where: { userId, date, calls: { lt: limit } },
        data: { calls: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new DomainError(
          ErrorCode.AI_RATE_LIMIT,
          `Daily Kernel AI call limit of ${limit} exceeded.`,
        );
      }
      const counter = await tx.aiUsage.findUniqueOrThrow({
        where: { userId_date: { userId, date } },
      });
      return counter.calls;
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
