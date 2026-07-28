import { Prisma } from '@prisma/client';
import type { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AuditService } from '../observability/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StrategyDefinition } from './definition/strategy-definition.types';
import {
  normalizeNameForUniqueness,
  StrategiesService,
} from './strategies.service';
import type { CreateStrategyInput } from './strategy.types';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000002';
const STRATEGY_ID = '00000000-0000-4000-8000-000000000010';
const CREATED_AT = new Date('2026-07-25T12:00:00.000Z');

function validDefinition(): StrategyDefinition {
  return {
    indicators: [
      {
        id: 'sma',
        type: 'SMA',
        params: { period: 20 },
        source: 'close',
      },
    ],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'sma' },
          op: 'gt',
          right: { literal: 100 },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'sma' },
          op: 'lt',
          right: { literal: 90 },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 2 },
      take_profit: { type: 'percent', value: 500 },
    },
  };
}

function invalidDefinition(value: unknown): StrategyDefinition {
  return value as StrategyDefinition;
}

function validInput(
  overrides: Partial<CreateStrategyInput> = {},
): CreateStrategyInput {
  return {
    name: 'Momentum',
    asset_type: 'EQUITY',
    timeframe: '1d',
    definition: validDefinition(),
    ...overrides,
  };
}

function createDependencies(prismaOverrides: Record<string, unknown> = {}) {
  const prisma = {
    isEnabled: false,
    ...prismaOverrides,
  } as unknown as PrismaService;
  const authService = {
    ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuthService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditService;

  return { prisma, authService, audit };
}

describe('StrategiesService', () => {
  it('creates version one in memory and returns an isolated response', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    const created = await service.create(
      USER_ID,
      validInput({
        name: '  Momentum  ',
        definition: validDefinition(),
      }),
    );

    expect(created).toMatchObject({
      name: 'Momentum',
      description: null,
      asset_type: 'EQUITY',
      symbol_scope: 'SINGLE',
      timeframe: '1d',
      is_active: true,
      version_number: 1,
      definition: validDefinition(),
    });
    expect(created.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(audit.record).toHaveBeenCalledWith({
      userId: USER_ID,
      eventType: 'strategy.created',
      payload: {
        strategy_id: created.id,
        name: 'Momentum',
      },
    });

    created.definition.indicators[0].params.period = 99;
    await expect(service.getById(USER_ID, created.id)).resolves.toMatchObject({
      definition: validDefinition(),
    });
  });

  it('reserves case- and accent-insensitive names for each user', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    await service.create(USER_ID, validInput({ name: ' Café Momentum ' }));

    await expect(
      service.create(USER_ID, validInput({ name: 'cafe momentum' })),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });

    await expect(
      service.create(OTHER_USER_ID, validInput({ name: 'CAFE MOMENTUM' })),
    ).resolves.toMatchObject({ name: 'CAFE MOMENTUM' });
  });

  it('folds MySQL Unicode expansion weights in seed-mode name conflicts', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    await service.create(USER_ID, validInput({ name: 'Straße Breakout' }));
    await service.create(USER_ID, validInput({ name: 'Œuvre Momentum' }));
    await service.create(USER_ID, validInput({ name: 'Σήμα Trend' }));

    await expect(
      service.create(USER_ID, validInput({ name: 'Strasse Breakout' })),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(
      service.create(USER_ID, validInput({ name: 'Oeuvre Momentum' })),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(
      service.create(USER_ID, validInput({ name: 'ςημα Trend' })),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('uses Unicode characters rather than UTF-16 code units for name limits', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.create(USER_ID, validInput({ name: '😀'.repeat(255) })),
    ).resolves.toMatchObject({ name: '😀'.repeat(255) });
    await expect(
      service.create(USER_ID, validInput({ name: '😀'.repeat(256) })),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('hides missing and cross-user strategies behind STRATEGY_NOT_FOUND', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const created = await service.create(USER_ID, validInput());

    await expect(
      service.getById(OTHER_USER_ID, created.id),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_NOT_FOUND });
    await expect(
      service.getById(USER_ID, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_NOT_FOUND });
  });

  it.each([
    {
      name: 'non-string name',
      input: validInput({ name: 123 as unknown as string }),
      field: 'name',
    },
    {
      name: 'non-string description',
      input: validInput({ description: 456 as unknown as string }),
      field: 'description',
    },
    {
      name: 'empty name',
      input: validInput({ name: '   ' }),
      field: 'name',
    },
    {
      name: 'overlong name',
      input: validInput({ name: 'x'.repeat(256) }),
      field: 'name',
    },
    {
      name: 'array definition',
      input: validInput({
        definition: invalidDefinition([]),
      }),
      field: 'definition',
    },
    {
      name: 'non-JSON definition value',
      input: validInput({
        definition: invalidDefinition({ period: undefined }),
      }),
      field: 'definition.period',
    },
    {
      name: 'non-finite definition number',
      input: validInput({
        definition: invalidDefinition({
          period: Number.POSITIVE_INFINITY,
        }),
      }),
      field: 'definition.period',
    },
    {
      name: 'non-plain definition object',
      input: validInput({
        definition: invalidDefinition({ created_at: new Date() }),
      }),
      field: 'definition.created_at',
    },
    {
      name: 'unsupported asset type',
      input: validInput({
        asset_type: 'FOREX' as unknown as 'EQUITY',
      }),
      field: 'asset_type',
    },
    {
      name: 'unsupported timeframe',
      input: validInput({
        timeframe: '5m' as unknown as '1d',
      }),
      field: 'timeframe',
    },
    {
      name: 'unsupported symbol scope',
      input: validInput({
        symbol_scope: 'PORTFOLIO' as unknown as 'SINGLE',
      }),
      field: 'symbol_scope',
    },
    {
      name: 'hourly equity',
      input: validInput({ timeframe: '1h' }),
      field: 'timeframe',
    },
  ])('defensively rejects $name', async ({ input, field }) => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    const creation = service.create(USER_ID, input);
    await expect(creation).rejects.toMatchObject({
      code: field.startsWith('definition')
        ? ErrorCode.STRATEGY_VALIDATION_ERROR
        : ErrorCode.VALIDATION_ERROR,
    });
    await expect(creation).rejects.toHaveProperty(
      'fieldErrors',
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
  });

  it('accepts repeated non-cyclic object references in internal definitions', async () => {
    const shared = { period: 20 };
    const definition = validDefinition();
    definition.indicators = [
      {
        id: 'first',
        type: 'SMA',
        params: shared,
        source: 'close',
      },
      {
        id: 'second',
        type: 'SMA',
        params: shared,
        source: 'close',
      },
    ];
    definition.entry.conditions[0].left = { indicator: 'first' };
    definition.exit.conditions[0].left = { indicator: 'second' };
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.create(USER_ID, validInput({ definition })),
    ).resolves.toMatchObject({
      definition: {
        indicators: [
          expect.objectContaining({ params: { period: 20 } }),
          expect.objectContaining({ params: { period: 20 } }),
        ],
      },
    });
  });

  it('rejects cyclic internal definitions', async () => {
    const definition: Record<string, unknown> = {};
    definition.self = definition;
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    const creation = service.create(
      USER_ID,
      validInput({ definition: invalidDefinition(definition) }),
    );
    await expect(creation).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_VALIDATION_ERROR,
    });
    await expect(creation).rejects.toHaveProperty(
      'fieldErrors',
      expect.arrayContaining([
        expect.objectContaining({ field: 'definition.self' }),
      ]),
    );
  });

  it('creates a nested strategy version through Prisma', async () => {
    const prismaRecord = {
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 1,
          strategyId: STRATEGY_ID,
          versionNumber: 1,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const create = jest.fn().mockResolvedValue(prismaRecord);
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { create },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(service.create(USER_ID, validInput())).resolves.toMatchObject({
      id: STRATEGY_ID,
      version_number: 1,
    });
    expect(authService.ensureUserPersisted).toHaveBeenCalledWith(USER_ID);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: USER_ID,
          name: 'Momentum',
          versions: {
            create: expect.objectContaining({
              versionNumber: 1,
              definitionJson: validDefinition(),
            }),
          },
        }),
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
      }),
    );
  });

  it('maps Prisma unique conflicts and rethrows unrelated failures', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: 'test' },
    );
    const create = jest
      .fn()
      .mockRejectedValueOnce(uniqueError)
      .mockRejectedValueOnce(new Error('database unavailable'));
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { create },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
    await expect(service.create(USER_ID, validInput())).rejects.toThrow(
      'database unavailable',
    );
  });

  it('loads the latest owned active version through Prisma', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: 'Latest',
      assetType: 'CRYPTO',
      symbolScope: 'SINGLE',
      timeframe: '1h',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 2,
          strategyId: STRATEGY_ID,
          versionNumber: 2,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    });
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { findFirst },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(service.getById(USER_ID, STRATEGY_ID)).resolves.toMatchObject({
      version_number: 2,
      definition: validDefinition(),
      description: 'Latest',
    });
    expect(authService.ensureUserPersisted).toHaveBeenCalledWith(USER_ID);
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: STRATEGY_ID,
        userId: USER_ID,
        isActive: true,
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('loads one requested historical Prisma version without scanning history', async () => {
    const latestDefinition = validDefinition();
    latestDefinition.indicators[0].params.period = 21;
    const findFirst = jest.fn().mockResolvedValue({
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 2,
          strategyId: STRATEGY_ID,
          versionNumber: 2,
          definitionJson: latestDefinition,
          createdAt: CREATED_AT,
        },
      ],
    });
    const findHistorical = jest.fn().mockResolvedValue({
      id: 1,
      strategyId: STRATEGY_ID,
      versionNumber: 1,
      definitionJson: validDefinition(),
      createdAt: CREATED_AT,
    });
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { findFirst },
      strategyVersion: { findFirst: findHistorical },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.getById(USER_ID, STRATEGY_ID, 1),
    ).resolves.toMatchObject({
      version_number: 1,
      is_latest: false,
      definition: validDefinition(),
    });
    expect(findHistorical).toHaveBeenCalledWith({
      where: { strategyId: STRATEGY_ID, versionNumber: 1 },
    });
  });

  it('treats missing Prisma rows and rows without versions as STRATEGY_NOT_FOUND', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: STRATEGY_ID,
        userId: USER_ID,
        name: 'Broken',
        description: null,
        assetType: 'EQUITY',
        symbolScope: 'SINGLE',
        timeframe: '1d',
        isActive: true,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        versions: [],
      });
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { findFirst },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(service.getById(USER_ID, STRATEGY_ID)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(service.getById(USER_ID, STRATEGY_ID)).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_NOT_FOUND,
    });
  });

  it('lists active owned strategies with stable pagination and no definitions', async () => {
    jest.useFakeTimers();
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    try {
      jest.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
      const first = await service.create(
        USER_ID,
        validInput({ name: 'First' }),
      );
      jest.setSystemTime(new Date('2026-07-25T12:01:00.000Z'));
      const second = await service.create(
        USER_ID,
        validInput({ name: 'Second' }),
      );
      await service.create(
        OTHER_USER_ID,
        validInput({ name: 'Other user strategy' }),
      );
      jest.setSystemTime(new Date('2026-07-25T12:02:00.000Z'));
      await service.update(USER_ID, first.id, { description: 'updated' });

      const page = await service.list(USER_ID, { limit: 1, offset: 0 });
      expect(page).toEqual({
        items: [
          {
            id: first.id,
            name: 'First',
            asset_type: 'EQUITY',
            timeframe: '1d',
            version_number: 1,
            created_at: '2026-07-25T12:00:00.000Z',
            updated_at: '2026-07-25T12:02:00.000Z',
            is_active: true,
          },
        ],
        limit: 1,
        offset: 0,
        has_more: true,
      });
      expect(
        await service.list(USER_ID, { limit: 1, offset: 1 }),
      ).toMatchObject({
        items: [expect.objectContaining({ id: second.id })],
        has_more: false,
      });
      expect(page.items[0]).not.toHaveProperty('definition');
    } finally {
      jest.useRealTimers();
    }
  });

  it('updates metadata without a version and appends every present definition', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const created = await service.create(
      USER_ID,
      validInput({ description: 'remove me' }),
    );

    const metadataUpdate = await service.update(USER_ID, created.id, {
      name: '  Renamed  ',
      description: null,
      asset_type: 'CRYPTO',
      timeframe: '1h',
    });
    expect(metadataUpdate).toMatchObject({
      name: 'Renamed',
      description: null,
      asset_type: 'CRYPTO',
      timeframe: '1h',
      version_number: 1,
    });

    const nextDefinition = validDefinition();
    nextDefinition.indicators[0].params.period = 21;
    const versionTwo = await service.update(USER_ID, created.id, {
      definition: nextDefinition,
    });
    const versionThree = await service.update(USER_ID, created.id, {
      definition: nextDefinition,
    });
    expect(versionTwo.version_number).toBe(2);
    expect(versionThree.version_number).toBe(3);

    await expect(
      service.getById(USER_ID, created.id, 1),
    ).resolves.toMatchObject({
      version_number: 1,
      is_latest: false,
      version_created_at: expect.any(String),
      definition: validDefinition(),
    });
    await expect(
      service.getById(USER_ID, created.id, 3),
    ).resolves.toMatchObject({
      version_number: 3,
      is_latest: true,
    });
    await expect(
      service.getById(USER_ID, created.id, 99),
    ).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_VERSION_NOT_FOUND,
    });
    expect(audit.record).toHaveBeenCalledWith({
      userId: USER_ID,
      eventType: 'strategy.updated',
      payload: {
        strategy_id: created.id,
        changed_fields: ['definition'],
        version_number: 3,
      },
    });
  });

  it('validates inline and persisted definitions without persisting', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const created = await service.create(USER_ID, validInput());
    const callsBeforeValidation = (audit.record as jest.Mock).mock.calls.length;

    await expect(
      service.validate(USER_ID, { definition: validDefinition() }),
    ).resolves.toEqual({
      is_valid: true,
      errors: [],
      summary:
        'Buy when SMA(20) > 100. Exit when SMA(20) < 90. ' +
        'Stop loss 2%. Take profit 500%.',
    });
    await expect(
      service.validate(USER_ID, { definition: { indicators: [] } }),
    ).resolves.toMatchObject({
      is_valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({ code: 'REQUIRED_FIELD', path: 'entry' }),
      ]),
      summary: null,
    });
    const persistedValidation = await service.validate(USER_ID, {
      strategy_id: created.id,
    });
    expect(persistedValidation.errors).toEqual([]);
    expect(persistedValidation).toMatchObject({
      is_valid: true,
      summary: expect.any(String),
    });
    await expect(
      service.validate(OTHER_USER_ID, { strategy_id: created.id }),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_NOT_FOUND });
    await expect(service.validate(USER_ID, {})).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_VALIDATION_ERROR,
    });
    await expect(
      service.validate(USER_ID, {
        definition: validDefinition(),
        strategy_id: created.id,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_VALIDATION_ERROR,
    });
    expect(audit.record).toHaveBeenCalledTimes(callsBeforeValidation);
  });

  it('soft deletes, hides, audits, and keeps names reserved', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const created = await service.create(USER_ID, validInput());

    await service.delete(USER_ID, created.id);

    await expect(service.getById(USER_ID, created.id)).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_NOT_FOUND,
    });
    await expect(service.delete(USER_ID, created.id)).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_NOT_FOUND,
    });
    await expect(
      service.list(USER_ID, { limit: 50, offset: 0 }),
    ).resolves.toEqual({
      items: [],
      limit: 50,
      offset: 0,
      has_more: false,
    });
    await expect(service.create(USER_ID, validInput())).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
    expect(audit.record).toHaveBeenCalledWith({
      userId: USER_ID,
      eventType: 'strategy.deleted',
      payload: { strategy_id: created.id, name: 'Momentum' },
    });
  });

  it('rejects invalid, empty, conflicting, and incompatible updates', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const first = await service.create(USER_ID, validInput({ name: 'First' }));
    await service.create(USER_ID, validInput({ name: 'Second' }));

    await expect(service.update(USER_ID, first.id, {})).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    await expect(
      service.update(USER_ID, first.id, {
        definition: [] as unknown as StrategyDefinition,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_VALIDATION_ERROR });
    await expect(
      service.update(USER_ID, first.id, { timeframe: '1h' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.update(USER_ID, first.id, { name: ' second ' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(
      service.update(OTHER_USER_ID, first.id, { description: 'hidden' }),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_NOT_FOUND });
  });

  it('uses a serializable Prisma transaction and retries P2034 once', async () => {
    const prismaRecord = {
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 2,
          strategyId: STRATEGY_ID,
          versionNumber: 2,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Write conflict',
      { code: 'P2034', clientVersion: 'test' },
    );
    const updatedRecord = {
      id: prismaRecord.id,
      userId: prismaRecord.userId,
      name: prismaRecord.name,
      assetType: prismaRecord.assetType,
      symbolScope: prismaRecord.symbolScope,
      timeframe: prismaRecord.timeframe,
      isActive: prismaRecord.isActive,
      createdAt: prismaRecord.createdAt,
      updatedAt: prismaRecord.updatedAt,
      versions: [
        {
          versionNumber: 2,
          definition: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce(updatedRecord);
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      $transaction: transaction,
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.update(USER_ID, STRATEGY_ID, { definition: validDefinition() }),
    ).resolves.toMatchObject({ version_number: 2 });
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('executes the full Prisma update transaction and appends a version', async () => {
    const current = {
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: 'before',
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 1,
          strategyId: STRATEGY_ID,
          versionNumber: 1,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const updated = {
      ...current,
      name: 'Renamed',
      description: 'after',
      assetType: 'CRYPTO',
      timeframe: '1h',
      versions: [
        {
          ...current.versions[0],
          id: 2,
          versionNumber: 2,
        },
      ],
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);
    const update = jest.fn().mockResolvedValue(updated);
    const createVersion = jest.fn().mockResolvedValue(updated.versions[0]);
    const transactionClient = {
      strategy: { findFirst, update },
      strategyVersion: { create: createVersion },
    };
    const transaction = jest
      .fn()
      .mockImplementation(
        async (work: (client: typeof transactionClient) => Promise<unknown>) =>
          work(transactionClient),
      );
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      $transaction: transaction,
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.update(USER_ID, STRATEGY_ID, {
        name: ' Renamed ',
        description: 'after',
        asset_type: 'CRYPTO',
        timeframe: '1h',
        definition: validDefinition(),
      }),
    ).resolves.toMatchObject({
      name: 'Renamed',
      asset_type: 'CRYPTO',
      timeframe: '1h',
      version_number: 2,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: STRATEGY_ID },
      data: expect.objectContaining({
        name: 'Renamed',
        description: 'after',
        assetType: 'CRYPTO',
        timeframe: '1h',
        updatedAt: expect.any(Date),
      }),
    });
    expect(createVersion).toHaveBeenCalledWith({
      data: expect.objectContaining({
        strategyId: STRATEGY_ID,
        versionNumber: 2,
        definitionJson: validDefinition(),
      }),
    });
  });

  it('executes a metadata-only Prisma update without creating a version', async () => {
    const record = {
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 1,
          strategyId: STRATEGY_ID,
          versionNumber: 1,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const findFirst = jest.fn().mockResolvedValue(record);
    const createVersion = jest.fn();
    const transactionClient = {
      strategy: {
        findFirst,
        update: jest.fn().mockResolvedValue(record),
      },
      strategyVersion: { create: createVersion },
    };
    const transaction = jest
      .fn()
      .mockImplementation(
        async (work: (client: typeof transactionClient) => Promise<unknown>) =>
          work(transactionClient),
      );
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      $transaction: transaction,
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.update(USER_ID, STRATEGY_ID, { description: null }),
    ).resolves.toMatchObject({ version_number: 1, description: null });
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('maps Prisma update ownership and unique-conflict failures', async () => {
    const nameConflict = new Prisma.PrismaClientKnownRequestError(
      'Unique name',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['user_id', 'name'] },
      },
    );
    const versionConflict = new Prisma.PrismaClientKnownRequestError(
      'Unique version',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['strategy_id', 'version_number'] },
      },
    );
    const transaction = jest
      .fn()
      .mockImplementationOnce(
        async (
          work: (client: {
            strategy: { findFirst: () => Promise<null> };
          }) => Promise<unknown>,
        ) =>
          work({
            strategy: { findFirst: jest.fn().mockResolvedValue(null) },
          }),
      )
      .mockRejectedValueOnce(nameConflict)
      .mockRejectedValueOnce(versionConflict)
      .mockRejectedValueOnce(versionConflict);
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      $transaction: transaction,
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.update(USER_ID, STRATEGY_ID, { description: 'missing' }),
    ).rejects.toMatchObject({ code: ErrorCode.STRATEGY_NOT_FOUND });
    await expect(
      service.update(USER_ID, STRATEGY_ID, { name: 'Taken' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    await expect(
      service.update(USER_ID, STRATEGY_ID, { definition: validDefinition() }),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
      message: expect.stringContaining('concurrently'),
    });
  });

  it('lists and soft deletes through Prisma, including delete races', async () => {
    const record = {
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 1,
          strategyId: STRATEGY_ID,
          versionNumber: 1,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    };
    const findMany = jest.fn().mockResolvedValue([record, record]);
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({ name: 'Momentum' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'Momentum' });
    const updateMany = jest
      .fn()
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { findMany, findFirst, updateMany },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.list(USER_ID, { limit: 1, offset: 2 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: STRATEGY_ID })],
      has_more: true,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 }),
    );
    await expect(service.delete(USER_ID, STRATEGY_ID)).resolves.toBeUndefined();
    await expect(service.delete(USER_ID, STRATEGY_ID)).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_NOT_FOUND,
    });
    await expect(service.delete(USER_ID, STRATEGY_ID)).rejects.toMatchObject({
      code: ErrorCode.STRATEGY_NOT_FOUND,
    });
    expect(authService.ensureUserPersisted).toHaveBeenCalledWith(USER_ID);
  });

  it('validates persisted definitions through Prisma', async () => {
    const findFirst = jest.fn().mockResolvedValue({
      id: STRATEGY_ID,
      userId: USER_ID,
      name: 'Momentum',
      description: null,
      assetType: 'EQUITY',
      symbolScope: 'SINGLE',
      timeframe: '1d',
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      versions: [
        {
          id: 1,
          strategyId: STRATEGY_ID,
          versionNumber: 1,
          definitionJson: validDefinition(),
          createdAt: CREATED_AT,
        },
      ],
    });
    const { prisma, authService, audit } = createDependencies({
      isEnabled: true,
      strategy: { findFirst },
    });
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.validate(USER_ID, { strategy_id: STRATEGY_ID }),
    ).resolves.toMatchObject({ is_valid: true, summary: expect.any(String) });
    expect(authService.ensureUserPersisted).toHaveBeenCalledWith(USER_ID);
  });

  it('accepts null-prototype definitions and rejects valid-shaped class instances', async () => {
    const plain = validDefinition() as unknown as Record<string, unknown>;
    const nullPrototype = Object.assign(Object.create(null) as object, plain);
    class DefinitionContainer {
      indicators = validDefinition().indicators;
      entry = validDefinition().entry;
      exit = validDefinition().exit;
      risk = validDefinition().risk;
    }
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);

    await expect(
      service.create(
        USER_ID,
        validInput({
          name: 'Null prototype',
          definition: nullPrototype as StrategyDefinition,
        }),
      ),
    ).resolves.toMatchObject({ name: 'Null prototype' });
    await expect(
      service.create(
        USER_ID,
        validInput({
          name: 'Class definition',
          definition: new DefinitionContainer(),
        }),
      ),
    ).rejects.toHaveProperty(
      'fieldErrors',
      expect.arrayContaining([
        expect.objectContaining({
          field: 'definition',
          reason: expect.stringContaining('INVALID_JSON'),
        }),
      ]),
    );
  });

  it('normalizes names with trim, case folding, and accent folding', () => {
    expect(normalizeNameForUniqueness('  CAFÉ  ')).toBe('cafe');
    expect(normalizeNameForUniqueness('Straße')).toBe('strasse');
    expect(normalizeNameForUniqueness('ŒUVRE')).toBe('oeuvre');
    expect(normalizeNameForUniqueness('Σ')).toBe(
      normalizeNameForUniqueness('ς'),
    );
  });
});
