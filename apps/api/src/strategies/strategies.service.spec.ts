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

  it('hides missing and cross-user strategies behind NOT_FOUND', async () => {
    const { prisma, authService, audit } = createDependencies();
    const service = new StrategiesService(prisma, authService, audit);
    const created = await service.create(USER_ID, validInput());

    await expect(
      service.getById(OTHER_USER_ID, created.id),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
    await expect(
      service.getById(USER_ID, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
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
      code: ErrorCode.VALIDATION_ERROR,
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
      code: ErrorCode.VALIDATION_ERROR,
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
          definitionJson: { version: 2 },
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
      definition: { version: 2 },
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

  it('treats missing Prisma rows and rows without versions as NOT_FOUND', async () => {
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
      code: ErrorCode.NOT_FOUND,
    });
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
