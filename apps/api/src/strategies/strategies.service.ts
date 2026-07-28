import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuditService } from '../observability/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StrategyDefinitionValidator } from './definition/strategy-definition.validator';
import {
  STRATEGY_ASSET_TYPES,
  STRATEGY_TIMEFRAMES,
  type CreateStrategyInput,
  type StrategyAssetType,
  type StrategyDefinition,
  type StrategyRecord,
  type StrategyResponse,
  type StrategySymbolScope,
  type StrategyTimeframe,
} from './strategy.types';

type PrismaStrategyWithVersions = Prisma.StrategyGetPayload<{
  include: { versions: true };
}>;

@Injectable()
export class StrategiesService {
  private readonly inMemoryStrategies = new Map<string, StrategyRecord>();
  private readonly inMemoryNameKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  async create(
    userId: string,
    input: CreateStrategyInput,
  ): Promise<StrategyResponse> {
    const normalized = normalizeCreateInput(input);
    assertCreateInput(normalized);

    const now = new Date();
    const id = crypto.randomUUID();
    let record: StrategyRecord;

    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      record = await this.createWithPrisma(userId, id, normalized, now);
    } else {
      record = this.createInMemory(userId, id, normalized, now);
    }

    await this.audit.record({
      userId,
      eventType: 'strategy.created',
      payload: {
        strategy_id: record.id,
        name: record.name,
      },
    });

    return toStrategyResponse(record);
  }

  async getById(userId: string, id: string): Promise<StrategyResponse> {
    if (this.prisma.isEnabled) {
      // Auth is process-local today. Reattach persisted ownership before a
      // read so strategies remain available immediately after an API restart.
      await this.authService.ensureUserPersisted(userId);
    }

    const record = this.prisma.isEnabled
      ? await this.findWithPrisma(userId, id)
      : this.findInMemory(userId, id);

    if (!record || !record.isActive || record.versions.length === 0) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Strategy ${id} was not found.`,
      );
    }

    return toStrategyResponse(record);
  }

  private async createWithPrisma(
    userId: string,
    id: string,
    input: NormalizedCreateStrategyInput,
    now: Date,
  ): Promise<StrategyRecord> {
    try {
      const record = await this.prisma.strategy.create({
        data: {
          id,
          userId,
          name: input.name,
          description: input.description ?? null,
          assetType: input.assetType,
          symbolScope: input.symbolScope,
          timeframe: input.timeframe,
          isActive: true,
          createdAt: now,
          updatedAt: now,
          versions: {
            create: {
              versionNumber: 1,
              definitionJson:
                input.definition as unknown as Prisma.InputJsonObject,
              createdAt: now,
            },
          },
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });

      return fromPrismaStrategy(record);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw duplicateNameError(input.name);
      }
      throw error;
    }
  }

  private createInMemory(
    userId: string,
    id: string,
    input: NormalizedCreateStrategyInput,
    now: Date,
  ): StrategyRecord {
    const nameKey = buildNameKey(userId, input.name);
    if (this.inMemoryNameKeys.has(nameKey)) {
      throw duplicateNameError(input.name);
    }

    const record: StrategyRecord = {
      id,
      userId,
      name: input.name,
      ...(input.description === undefined
        ? {}
        : { description: input.description }),
      assetType: input.assetType,
      symbolScope: input.symbolScope,
      timeframe: input.timeframe,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      versions: [
        {
          versionNumber: 1,
          definition: structuredClone(input.definition),
          createdAt: now,
        },
      ],
    };

    this.inMemoryNameKeys.add(nameKey);
    this.inMemoryStrategies.set(record.id, record);
    return record;
  }

  private async findWithPrisma(
    userId: string,
    id: string,
  ): Promise<StrategyRecord | undefined> {
    const record = await this.prisma.strategy.findFirst({
      where: {
        id,
        userId,
        isActive: true,
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    return record ? fromPrismaStrategy(record) : undefined;
  }

  private findInMemory(userId: string, id: string): StrategyRecord | undefined {
    const record = this.inMemoryStrategies.get(id);
    return record?.userId === userId ? record : undefined;
  }
}

interface NormalizedCreateStrategyInput {
  name: string;
  description?: string;
  assetType: StrategyAssetType;
  symbolScope: StrategySymbolScope;
  timeframe: StrategyTimeframe;
  definition: StrategyDefinition;
}

function normalizeCreateInput(
  input: CreateStrategyInput,
): NormalizedCreateStrategyInput {
  if (typeof input.name !== 'string') {
    throw validationError('name', 'name must be a string');
  }
  if (
    input.description !== undefined &&
    typeof input.description !== 'string'
  ) {
    throw validationError('description', 'description must be a string');
  }
  if (!STRATEGY_ASSET_TYPES.includes(input.asset_type)) {
    throw validationError(
      'asset_type',
      'asset_type must be one of the following values: EQUITY, CRYPTO',
    );
  }
  if (!STRATEGY_TIMEFRAMES.includes(input.timeframe)) {
    throw validationError(
      'timeframe',
      'timeframe must be one of the following values: 1d, 1h',
    );
  }

  return {
    name: input.name.trim(),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
    assetType: input.asset_type,
    symbolScope: input.symbol_scope ?? 'SINGLE',
    timeframe: input.timeframe,
    definition: input.definition,
  };
}

function assertCreateInput(input: NormalizedCreateStrategyInput): void {
  const nameLength = Array.from(input.name).length;
  if (nameLength === 0 || nameLength > 255) {
    throw validationError('name', 'name must be between 1 and 255 characters');
  }

  const definitionValidation = StrategyDefinitionValidator.validate(
    input.definition,
  );
  if (!definitionValidation.is_valid) {
    throw new DomainError(
      ErrorCode.VALIDATION_ERROR,
      'Strategy definition is invalid.',
      400,
      definitionValidation.errors.map((error) => ({
        field: error.path ? `definition.${error.path}` : 'definition',
        reason: `${error.code}: ${error.message}`,
      })),
    );
  }

  if (!isJsonObject(input.definition)) {
    throw validationError(
      'definition',
      'definition must be a JSON-compatible object',
    );
  }

  if (input.symbolScope !== 'SINGLE') {
    throw validationError(
      'symbol_scope',
      'symbol_scope must be the value SINGLE',
    );
  }

  if (input.assetType === 'EQUITY' && input.timeframe !== '1d') {
    throw validationError(
      'timeframe',
      'timeframe must be 1d when asset_type is EQUITY',
    );
  }
}

function isJsonObject(value: unknown): boolean {
  const stack: Array<{ value: unknown; exiting: boolean }> = [
    { value, exiting: false },
  ];
  const activeAncestors = new WeakSet<object>();

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }
    const candidate = frame.value;
    if (frame.exiting) {
      activeAncestors.delete(candidate as object);
      continue;
    }

    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      continue;
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) {
        return false;
      }
      continue;
    }
    if (typeof candidate !== 'object') {
      return false;
    }

    if (activeAncestors.has(candidate)) {
      return false;
    }
    activeAncestors.add(candidate);
    stack.push({ value: candidate, exiting: true });

    if (Array.isArray(candidate)) {
      for (const child of candidate) {
        stack.push({ value: child, exiting: false });
      }
      continue;
    }

    const prototype = Reflect.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      return false;
    }
    for (const child of Object.values(candidate as Record<string, unknown>)) {
      stack.push({ value: child, exiting: false });
    }
  }

  return true;
}

function validationError(field: string, reason: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, reason, 400, [
    { field, reason },
  ]);
}

function duplicateNameError(name: string): DomainError {
  return new DomainError(
    ErrorCode.CONFLICT,
    `A strategy named "${name}" already exists.`,
  );
}

function buildNameKey(userId: string, name: string): string {
  return `${userId}\u0000${normalizeNameForUniqueness(name)}`;
}

export function normalizeNameForUniqueness(name: string): string {
  return (
    name
      .trim()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      // utf8mb4_unicode_ci applies these multi-character Unicode weights.
      // Apply them before lowercasing so newer UCA-only characters (for example
      // capital sharp S) are not folded more broadly than MySQL's UCA 4 collation.
      .replace(/ß/g, 'ss')
      .replace(/[Œœ]/g, 'oe')
      .replace(/ς/g, 'σ')
      .toLocaleLowerCase('en-US')
  );
}

function fromPrismaStrategy(
  record: PrismaStrategyWithVersions,
): StrategyRecord {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    ...(record.description === null ? {} : { description: record.description }),
    assetType: record.assetType as StrategyAssetType,
    symbolScope: record.symbolScope as StrategySymbolScope,
    timeframe: record.timeframe as StrategyTimeframe,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    versions: record.versions.map((version) => ({
      versionNumber: version.versionNumber,
      definition: version.definitionJson as unknown as StrategyDefinition,
      createdAt: version.createdAt,
    })),
  };
}

function toStrategyResponse(record: StrategyRecord): StrategyResponse {
  const version = record.versions[0];
  if (!version) {
    throw new DomainError(
      ErrorCode.NOT_FOUND,
      `Strategy ${record.id} was not found.`,
    );
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description ?? null,
    asset_type: record.assetType,
    symbol_scope: record.symbolScope,
    timeframe: record.timeframe,
    is_active: record.isActive,
    version_number: version.versionNumber,
    definition: structuredClone(version.definition),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
