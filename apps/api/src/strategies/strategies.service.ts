import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuditService } from '../observability/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StrategyDefinitionValidator } from './definition/strategy-definition.validator';
import { summarizeStrategyDefinition } from './definition/strategy-summary';
import {
  STRATEGY_ASSET_TYPES,
  STRATEGY_TIMEFRAMES,
  type CreateStrategyInput,
  type HistoricalStrategyResponse,
  type OwnedStrategyVersion,
  type StrategyAssetType,
  type StrategyDefinition,
  type StrategyDefinitionValidationError,
  type StrategyListItem,
  type StrategyListResponse,
  type StrategyRecord,
  type StrategyResponse,
  type StrategySymbolScope,
  type StrategyTimeframe,
  type UpdateStrategyInput,
  type ValidateStrategyInput,
  type ValidateStrategyResponse,
} from './strategy.types';

type PrismaStrategyWithVersions = Prisma.StrategyGetPayload<{
  include: { versions: true };
}>;

interface ListOptions {
  limit: number;
  offset: number;
}

const MAX_UPDATE_TRANSACTION_ATTEMPTS = 2;

@Injectable()
export class StrategiesService {
  private readonly inMemoryStrategies = new Map<string, StrategyRecord>();
  private readonly inMemoryNameKeys = new Set<string>();
  private nextInMemoryVersionId = 1;

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

    return toStrategyResponse(record, requireLatestVersion(record));
  }

  async list(
    userId: string,
    options: ListOptions,
  ): Promise<StrategyListResponse> {
    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      const records = await this.prisma.strategy.findMany({
        where: { userId, isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        skip: options.offset,
        take: options.limit + 1,
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      });
      return toListResponse(
        records.map(fromPrismaStrategy),
        options.limit,
        options.offset,
      );
    }

    const records = [...this.inMemoryStrategies.values()]
      .filter((record) => record.userId === userId && record.isActive)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .slice(options.offset, options.offset + options.limit + 1);

    return toListResponse(records, options.limit, options.offset);
  }

  async getById(
    userId: string,
    id: string,
    requestedVersion?: number,
  ): Promise<StrategyResponse | HistoricalStrategyResponse> {
    if (this.prisma.isEnabled) {
      // Auth is process-local today. Reattach persisted ownership before a
      // read so strategies remain available immediately after an API restart.
      await this.authService.ensureUserPersisted(userId);
    }

    const record = this.prisma.isEnabled
      ? await this.findWithPrisma(userId, id, requestedVersion)
      : this.findInMemory(userId, id);

    if (!record || !record.isActive || record.versions.length === 0) {
      throw strategyNotFoundError(id);
    }

    const latest = requireLatestVersion(record);
    if (requestedVersion === undefined) {
      return toStrategyResponse(record, latest);
    }

    const selected = record.versions.find(
      (version) => version.versionNumber === requestedVersion,
    );
    if (!selected) {
      throw strategyVersionNotFoundError(id, requestedVersion);
    }

    return {
      ...toStrategyResponse(record, selected),
      version_created_at: selected.createdAt.toISOString(),
      is_latest: selected.versionNumber === latest.versionNumber,
    };
  }

  async update(
    userId: string,
    id: string,
    input: UpdateStrategyInput,
  ): Promise<StrategyResponse> {
    const normalized = normalizeUpdateInput(input);
    let record: StrategyRecord;

    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      record = await this.updateWithPrisma(userId, id, normalized);
    } else {
      record = this.updateInMemory(userId, id, normalized);
    }

    const latest = requireLatestVersion(record);
    await this.audit.record({
      userId,
      eventType: 'strategy.updated',
      payload: {
        strategy_id: record.id,
        changed_fields: normalized.changedFields,
        version_number: latest.versionNumber,
      },
    });

    return toStrategyResponse(record, latest);
  }

  async delete(userId: string, id: string): Promise<void> {
    let name: string;

    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      name = await this.deleteWithPrisma(userId, id);
    } else {
      const record = this.findInMemory(userId, id);
      if (!record || !record.isActive) {
        throw strategyNotFoundError(id);
      }
      record.isActive = false;
      record.updatedAt = new Date();
      name = record.name;
    }

    await this.audit.record({
      userId,
      eventType: 'strategy.deleted',
      payload: { strategy_id: id, name },
    });
  }

  async validate(
    userId: string,
    input: ValidateStrategyInput,
  ): Promise<ValidateStrategyResponse> {
    const hasDefinition = input.definition !== undefined;
    const hasStrategyId = input.strategy_id !== undefined;
    if (hasDefinition === hasStrategyId) {
      throw new DomainError(
        ErrorCode.STRATEGY_VALIDATION_ERROR,
        'Exactly one of definition or strategy_id is required.',
        400,
        [
          {
            field: 'body',
            reason: 'Exactly one of definition or strategy_id is required.',
          },
        ],
      );
    }

    let definition = input.definition;
    if (hasStrategyId) {
      const strategyId = input.strategy_id;
      if (typeof strategyId !== 'string') {
        throw validationError('strategy_id', 'strategy_id must be a UUID');
      }
      if (this.prisma.isEnabled) {
        await this.authService.ensureUserPersisted(userId);
      }
      const record = this.prisma.isEnabled
        ? await this.findWithPrisma(userId, strategyId)
        : this.findInMemory(userId, strategyId);
      if (!record || !record.isActive || record.versions.length === 0) {
        throw strategyNotFoundError(strategyId);
      }
      definition = requireLatestVersion(record).definition;
    }

    return validateDefinitionForResponse(definition);
  }

  /**
   * Internal owner-scoped reader for consumers that must pin an immutable
   * strategy version without exposing database ids through the HTTP API.
   */
  async resolveOwnedVersion(
    userId: string,
    strategyId: string,
    explicitVersionId?: number,
  ): Promise<OwnedStrategyVersion> {
    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      const record = await this.prisma.strategy.findFirst({
        where: { id: strategyId, userId, isActive: true },
        select: {
          id: true,
          assetType: true,
          timeframe: true,
          versions: {
            ...(explicitVersionId === undefined
              ? {}
              : { where: { id: explicitVersionId } }),
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              definitionJson: true,
            },
          },
        },
      });
      if (!record) {
        throw strategyNotFoundError(strategyId);
      }
      const version = record.versions[0];
      if (!version) {
        if (explicitVersionId !== undefined) {
          throw strategyVersionIdNotFoundError(strategyId, explicitVersionId);
        }
        throw strategyNotFoundError(strategyId);
      }
      return {
        strategyId: record.id,
        strategyVersionId: version.id,
        versionNumber: version.versionNumber,
        assetType: record.assetType as StrategyAssetType,
        timeframe: record.timeframe as StrategyTimeframe,
        definition: structuredClone(
          version.definitionJson as unknown as StrategyDefinition,
        ),
      };
    }

    const record = this.findInMemory(userId, strategyId);
    if (!record || !record.isActive) {
      throw strategyNotFoundError(strategyId);
    }
    const version =
      explicitVersionId === undefined
        ? record.versions[0]
        : record.versions.find(
            (candidate) => candidate.id === explicitVersionId,
          );
    if (!version) {
      if (explicitVersionId !== undefined) {
        throw strategyVersionIdNotFoundError(strategyId, explicitVersionId);
      }
      throw strategyNotFoundError(strategyId);
    }
    return {
      strategyId: record.id,
      strategyVersionId: version.id,
      versionNumber: version.versionNumber,
      assetType: record.assetType,
      timeframe: record.timeframe,
      definition: structuredClone(version.definition),
    };
  }

  /**
   * Resolves the immutable version already pinned to a run. Soft-deleting the
   * strategy must not make an accepted backtest job impossible to finish.
   */
  async resolvePinnedVersionForRun(
    userId: string,
    strategyId: string,
    strategyVersionId: number,
  ): Promise<OwnedStrategyVersion> {
    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      const record = await this.prisma.strategy.findFirst({
        where: { id: strategyId, userId },
        select: {
          id: true,
          assetType: true,
          timeframe: true,
          versions: {
            where: { id: strategyVersionId },
            take: 1,
            select: {
              id: true,
              versionNumber: true,
              definitionJson: true,
            },
          },
        },
      });
      const version = record?.versions[0];
      if (!record || !version) {
        throw strategyVersionIdNotFoundError(strategyId, strategyVersionId);
      }
      return {
        strategyId: record.id,
        strategyVersionId: version.id,
        versionNumber: version.versionNumber,
        assetType: record.assetType as StrategyAssetType,
        timeframe: record.timeframe as StrategyTimeframe,
        definition: structuredClone(
          version.definitionJson as unknown as StrategyDefinition,
        ),
      };
    }

    const record = this.findInMemory(userId, strategyId);
    const version = record?.versions.find(
      (candidate) => candidate.id === strategyVersionId,
    );
    if (!record || !version) {
      throw strategyVersionIdNotFoundError(strategyId, strategyVersionId);
    }
    return {
      strategyId: record.id,
      strategyVersionId: version.id,
      versionNumber: version.versionNumber,
      assetType: record.assetType,
      timeframe: record.timeframe,
      definition: structuredClone(version.definition),
    };
  }

  async getOwnedStrategyNames(
    userId: string,
    strategyIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(strategyIds)];
    if (ids.length === 0) {
      return new Map();
    }
    if (this.prisma.isEnabled) {
      await this.authService.ensureUserPersisted(userId);
      const records = await this.prisma.strategy.findMany({
        where: { userId, id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(records.map((record) => [record.id, record.name]));
    }
    return new Map(
      [...this.inMemoryStrategies.values()]
        .filter((record) => record.userId === userId && ids.includes(record.id))
        .map((record) => [record.id, record.name]),
    );
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
          id: this.nextInMemoryVersionId++,
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

  private async updateWithPrisma(
    userId: string,
    id: string,
    input: NormalizedUpdateStrategyInput,
  ): Promise<StrategyRecord> {
    try {
      for (
        let attempt = 1;
        attempt <= MAX_UPDATE_TRANSACTION_ATTEMPTS;
        attempt += 1
      ) {
        try {
          return await this.prisma.$transaction(
            async (transaction) => {
              const current = await transaction.strategy.findFirst({
                where: { id, userId, isActive: true },
                include: {
                  versions: {
                    orderBy: { versionNumber: 'desc' },
                    take: 1,
                  },
                },
              });
              if (!current || current.versions.length === 0) {
                throw strategyNotFoundError(id);
              }

              const currentRecord = fromPrismaStrategy(current);
              assertEffectiveUpdate(currentRecord, input);
              const now = new Date();
              const data: Prisma.StrategyUpdateInput = { updatedAt: now };
              if (input.hasName) {
                data.name = input.name;
              }
              if (input.hasDescription) {
                data.description = input.description;
              }
              if (input.hasAssetType) {
                data.assetType = input.assetType;
              }
              if (input.hasTimeframe) {
                data.timeframe = input.timeframe;
              }

              await transaction.strategy.update({ where: { id }, data });

              if (input.hasDefinition) {
                await transaction.strategyVersion.create({
                  data: {
                    strategyId: id,
                    versionNumber:
                      requireLatestVersion(currentRecord).versionNumber + 1,
                    definitionJson:
                      input.definition as unknown as Prisma.InputJsonObject,
                    createdAt: now,
                  },
                });
              }

              const updated = await transaction.strategy.findFirst({
                where: { id, userId, isActive: true },
                include: {
                  versions: {
                    orderBy: { versionNumber: 'desc' },
                    take: 1,
                  },
                },
              });
              if (!updated) {
                throw strategyNotFoundError(id);
              }
              return fromPrismaStrategy(updated);
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if (
            attempt < MAX_UPDATE_TRANSACTION_ATTEMPTS &&
            isRetryableUpdateConflict(error)
          ) {
            continue;
          }
          throw error;
        }
      }

      throw new Error('Strategy update retry loop exited unexpectedly.');
    } catch (error) {
      if (isVersionUniqueConstraintError(error)) {
        throw concurrentUpdateError();
      }
      if (isUniqueConstraintError(error)) {
        throw duplicateNameError(input.name ?? '');
      }
      throw error;
    }
  }

  private updateInMemory(
    userId: string,
    id: string,
    input: NormalizedUpdateStrategyInput,
  ): StrategyRecord {
    const record = this.findInMemory(userId, id);
    if (!record || !record.isActive || record.versions.length === 0) {
      throw strategyNotFoundError(id);
    }
    assertEffectiveUpdate(record, input);

    const oldNameKey = buildNameKey(userId, record.name);
    const newNameKey = input.hasName
      ? buildNameKey(userId, input.name as string)
      : oldNameKey;
    if (newNameKey !== oldNameKey && this.inMemoryNameKeys.has(newNameKey)) {
      throw duplicateNameError(input.name as string);
    }

    if (input.hasName) {
      record.name = input.name as string;
      if (newNameKey !== oldNameKey) {
        this.inMemoryNameKeys.delete(oldNameKey);
        this.inMemoryNameKeys.add(newNameKey);
      }
    }
    if (input.hasDescription) {
      if (input.description === null) {
        delete record.description;
      } else {
        record.description = input.description;
      }
    }
    if (input.hasAssetType) {
      record.assetType = input.assetType as StrategyAssetType;
    }
    if (input.hasTimeframe) {
      record.timeframe = input.timeframe as StrategyTimeframe;
    }

    const now = new Date();
    if (input.hasDefinition) {
      record.versions.unshift({
        id: this.nextInMemoryVersionId++,
        versionNumber: requireLatestVersion(record).versionNumber + 1,
        definition: structuredClone(input.definition as StrategyDefinition),
        createdAt: now,
      });
    }
    record.updatedAt = now;
    return record;
  }

  private async deleteWithPrisma(userId: string, id: string): Promise<string> {
    const current = await this.prisma.strategy.findFirst({
      where: { id, userId, isActive: true },
      select: { name: true },
    });
    if (!current) {
      throw strategyNotFoundError(id);
    }

    const result = await this.prisma.strategy.updateMany({
      where: { id, userId, isActive: true },
      data: { isActive: false, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      throw strategyNotFoundError(id);
    }
    return current.name;
  }

  private async findWithPrisma(
    userId: string,
    id: string,
    requestedVersion?: number,
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

    if (!record) {
      return undefined;
    }

    const result = fromPrismaStrategy(record);
    if (
      requestedVersion !== undefined &&
      result.versions[0]?.versionNumber !== requestedVersion
    ) {
      const historicalVersion = await this.prisma.strategyVersion.findFirst({
        where: { strategyId: id, versionNumber: requestedVersion },
      });
      if (historicalVersion) {
        result.versions.push({
          id: historicalVersion.id,
          versionNumber: historicalVersion.versionNumber,
          definition:
            historicalVersion.definitionJson as unknown as StrategyDefinition,
          createdAt: historicalVersion.createdAt,
        });
      }
    }
    return result;
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

interface NormalizedUpdateStrategyInput {
  hasName: boolean;
  name?: string;
  hasDescription: boolean;
  description?: string | null;
  hasAssetType: boolean;
  assetType?: StrategyAssetType;
  hasTimeframe: boolean;
  timeframe?: StrategyTimeframe;
  hasDefinition: boolean;
  definition?: StrategyDefinition;
  changedFields: string[];
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

function normalizeUpdateInput(
  input: UpdateStrategyInput,
): NormalizedUpdateStrategyInput {
  const hasName = input.name !== undefined;
  const hasDescription = input.description !== undefined;
  const hasAssetType = input.asset_type !== undefined;
  const hasTimeframe = input.timeframe !== undefined;
  const hasDefinition = input.definition !== undefined;
  if (
    !hasName &&
    !hasDescription &&
    !hasAssetType &&
    !hasTimeframe &&
    !hasDefinition
  ) {
    throw validationError('body', 'At least one update field is required');
  }

  let name: string | undefined;
  if (hasName) {
    if (typeof input.name !== 'string') {
      throw validationError('name', 'name must be a string');
    }
    name = input.name.trim();
    assertName(name);
  }

  if (
    hasDescription &&
    input.description !== null &&
    typeof input.description !== 'string'
  ) {
    throw validationError(
      'description',
      'description must be a string or null',
    );
  }
  if (
    hasAssetType &&
    !STRATEGY_ASSET_TYPES.includes(input.asset_type as StrategyAssetType)
  ) {
    throw validationError(
      'asset_type',
      'asset_type must be one of the following values: EQUITY, CRYPTO',
    );
  }
  if (
    hasTimeframe &&
    !STRATEGY_TIMEFRAMES.includes(input.timeframe as StrategyTimeframe)
  ) {
    throw validationError(
      'timeframe',
      'timeframe must be one of the following values: 1d, 1h',
    );
  }
  if (hasDefinition) {
    assertValidDefinition(input.definition);
  }

  return {
    hasName,
    ...(hasName ? { name } : {}),
    hasDescription,
    ...(hasDescription ? { description: input.description } : {}),
    hasAssetType,
    ...(hasAssetType ? { assetType: input.asset_type } : {}),
    hasTimeframe,
    ...(hasTimeframe ? { timeframe: input.timeframe } : {}),
    hasDefinition,
    ...(hasDefinition ? { definition: input.definition } : {}),
    changedFields: [
      ...(hasName ? ['name'] : []),
      ...(hasDescription ? ['description'] : []),
      ...(hasAssetType ? ['asset_type'] : []),
      ...(hasTimeframe ? ['timeframe'] : []),
      ...(hasDefinition ? ['definition'] : []),
    ],
  };
}

function assertCreateInput(input: NormalizedCreateStrategyInput): void {
  assertName(input.name);
  assertValidDefinition(input.definition);

  if (input.symbolScope !== 'SINGLE') {
    throw validationError(
      'symbol_scope',
      'symbol_scope must be the value SINGLE',
    );
  }
  assertAssetTimeframe(input.assetType, input.timeframe);
}

function assertEffectiveUpdate(
  record: StrategyRecord,
  input: NormalizedUpdateStrategyInput,
): void {
  assertAssetTimeframe(
    input.hasAssetType
      ? (input.assetType as StrategyAssetType)
      : record.assetType,
    input.hasTimeframe
      ? (input.timeframe as StrategyTimeframe)
      : record.timeframe,
  );
}

function assertName(name: string): void {
  const nameLength = Array.from(name).length;
  if (nameLength === 0 || nameLength > 255) {
    throw validationError('name', 'name must be between 1 and 255 characters');
  }
}

function assertAssetTimeframe(
  assetType: StrategyAssetType,
  timeframe: StrategyTimeframe,
): void {
  if (assetType === 'EQUITY' && timeframe !== '1d') {
    throw validationError(
      'timeframe',
      'timeframe must be 1d when asset_type is EQUITY',
    );
  }
}

function assertValidDefinition(
  definition: unknown,
): asserts definition is StrategyDefinition {
  const validation = validateDefinition(definition);
  if (!validation.is_valid) {
    throw new DomainError(
      ErrorCode.STRATEGY_VALIDATION_ERROR,
      'Strategy definition is invalid.',
      400,
      validation.errors.map((error) => ({
        field: error.path ? `definition.${error.path}` : 'definition',
        reason: `${error.code}: ${error.message}`,
      })),
    );
  }
}

function validateDefinitionForResponse(
  definition: unknown,
): ValidateStrategyResponse {
  const validation = validateDefinition(definition);
  if (!validation.is_valid) {
    return { ...validation, summary: null };
  }
  return {
    is_valid: true,
    errors: [],
    summary: summarizeStrategyDefinition(definition as StrategyDefinition),
  };
}

function validateDefinition(definition: unknown): {
  is_valid: boolean;
  errors: StrategyDefinitionValidationError[];
} {
  const validation = StrategyDefinitionValidator.validate(definition);
  if (!validation.is_valid) {
    return validation;
  }
  if (!isJsonObject(definition)) {
    return {
      is_valid: false,
      errors: [
        {
          path: '',
          code: 'INVALID_JSON',
          message: 'Definition must be a JSON-compatible object.',
        },
      ],
    };
  }
  return validation;
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

    if (!hasPlainObjectPrototype(candidate)) {
      return false;
    }
    for (const child of Object.values(candidate as Record<string, unknown>)) {
      stack.push({ value: child, exiting: false });
    }
  }

  return true;
}

function hasPlainObjectPrototype(value: object): boolean {
  const prototype: object | null = Reflect.getPrototypeOf(value);
  if (prototype === null) {
    return true;
  }
  if (Reflect.getPrototypeOf(prototype) !== null) {
    return false;
  }
  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
    ?.value as unknown;
  return typeof constructor === 'function' && constructor.name === 'Object';
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

function concurrentUpdateError(): DomainError {
  return new DomainError(
    ErrorCode.CONFLICT,
    'The strategy was updated concurrently. Retry the request.',
  );
}

function strategyNotFoundError(id: string): DomainError {
  return new DomainError(
    ErrorCode.STRATEGY_NOT_FOUND,
    `Strategy ${id} was not found.`,
  );
}

function strategyVersionNotFoundError(
  id: string,
  version: number,
): DomainError {
  return new DomainError(
    ErrorCode.STRATEGY_VERSION_NOT_FOUND,
    `Version ${version} of strategy ${id} was not found.`,
  );
}

function strategyVersionIdNotFoundError(
  id: string,
  versionId: number,
): DomainError {
  return new DomainError(
    ErrorCode.STRATEGY_VERSION_NOT_FOUND,
    `Strategy version ${versionId} does not belong to strategy ${id}.`,
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
      id: version.id,
      versionNumber: version.versionNumber,
      definition: version.definitionJson as unknown as StrategyDefinition,
      createdAt: version.createdAt,
    })),
  };
}

function toStrategyResponse(
  record: StrategyRecord,
  version: StrategyRecord['versions'][number],
): StrategyResponse {
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
    summary: summarizeStrategyDefinition(version.definition),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

function toListResponse(
  records: StrategyRecord[],
  limit: number,
  offset: number,
): StrategyListResponse {
  return {
    items: records.slice(0, limit).map(toStrategyListItem),
    limit,
    offset,
    has_more: records.length > limit,
  };
}

function toStrategyListItem(record: StrategyRecord): StrategyListItem {
  return {
    id: record.id,
    name: record.name,
    asset_type: record.assetType,
    timeframe: record.timeframe,
    version_number: requireLatestVersion(record).versionNumber,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    is_active: record.isActive,
  };
}

function requireLatestVersion(
  record: StrategyRecord,
): StrategyRecord['versions'][number] {
  const version = record.versions[0];
  if (!version) {
    throw strategyNotFoundError(record.id);
  }
  return version;
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function isRetryableUpdateConflict(error: unknown): boolean {
  return (
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034') ||
    isVersionUniqueConstraintError(error)
  );
}

function isVersionUniqueConstraintError(error: unknown): boolean {
  if (!isUniqueConstraintError(error)) {
    return false;
  }
  const target = JSON.stringify(error.meta?.target ?? '').toLowerCase();
  return target.includes('strategy') && target.includes('version_number');
}
