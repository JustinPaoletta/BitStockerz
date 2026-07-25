import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecordInput {
  userId?: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

interface InMemoryAuditEvent {
  id: number;
  userId?: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

/** Visible for tests that exercise the in-memory ring buffer. */
export const MAX_IN_MEMORY_AUDIT_EVENTS = 1000;
const MAX_IN_MEMORY_EVENTS = MAX_IN_MEMORY_AUDIT_EVENTS;
const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'password',
  'access_token',
  'token',
  'authorization',
  'cookie',
  'code',
  'private_key',
  'client_secret',
]);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly inMemoryEvents: InMemoryAuditEvent[] = [];
  private nextId = 1;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      const payload = sanitizePayload(input.payload ?? {});
      const createdAt = new Date();

      if (this.prisma.isEnabled) {
        if (input.userId) {
          await this.authService.ensureUserPersisted(input.userId);
        }

        await this.prisma.auditEvent.create({
          data: {
            userId: input.userId ?? null,
            eventType: input.eventType,
            payloadJson: payload as Prisma.InputJsonValue,
            createdAt,
          },
        });
        return;
      }

      this.inMemoryEvents.push({
        id: this.nextId++,
        userId: input.userId,
        eventType: input.eventType,
        payload,
        createdAt,
      });

      if (this.inMemoryEvents.length > MAX_IN_MEMORY_EVENTS) {
        this.inMemoryEvents.splice(
          0,
          this.inMemoryEvents.length - MAX_IN_MEMORY_EVENTS,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to record audit event ${input.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Test helper — seed-mode only. */
  getInMemoryEventsForTests(): readonly InMemoryAuditEvent[] {
    return this.inMemoryEvents;
  }

  resetForTests(): void {
    this.inMemoryEvents.length = 0;
    this.nextId = 1;
  }
}

function sanitizePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key.toLowerCase())) {
      continue;
    }
    sanitized[key] = value;
  }

  return sanitized;
}
