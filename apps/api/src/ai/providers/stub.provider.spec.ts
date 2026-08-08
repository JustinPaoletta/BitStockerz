import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { AuthService } from '../../auth/auth.service';
import type { AppConfigService } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { AiUsageService } from '../ai-usage.service';
import { isAiOperation } from './ai-provider';
import { StubProvider } from './stub.provider';
import {
  explainBacktestOutputSchema,
  explainStrategyOutputSchema,
  suggestImprovementsOutputSchema,
  validateStrategyOutputSchema,
} from '../schemas/ai-output.schemas';

describe('StubProvider', () => {
  const provider = new StubProvider();

  it.each([
    ['explain_strategy', explainStrategyOutputSchema],
    ['validate_strategy', validateStrategyOutputSchema],
    ['explain_backtest', explainBacktestOutputSchema],
    ['suggest_improvements', suggestImprovementsOutputSchema],
  ] as const)(
    'returns schema-valid output for %s',
    async (operation, schema) => {
      const result = await provider.generate({
        operation,
        schema,
        system: 'system',
        prompt: 'prompt',
        model: 'stub',
        maxOutputTokens: 100,
        maxRetries: 0,
        stubContext: {
          strategy_name: 'Alpha',
          backtest_run_id: 'run-1',
        },
      });
      expect(result.model).toBe('stub');
      expect(result.output).toEqual(expect.any(Object));
    },
  );
});

describe('isAiOperation', () => {
  it('accepts known operations only', () => {
    expect(isAiOperation('explain_strategy')).toBe(true);
    expect(isAiOperation('nope')).toBe(false);
  });
});

describe('AiUsageService prisma path', () => {
  it('creates and increments usage rows transactionally', async () => {
    const tx = {
      aiUsage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ calls: 1 })
          .mockResolvedValueOnce({ calls: 2 }),
        create: jest.fn().mockResolvedValue({ calls: 1 }),
        update: jest.fn().mockResolvedValue({ calls: 2 }),
      },
    };
    const prisma = {
      isEnabled: true,
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<number>) => fn(tx),
      ),
    };
    const auth = {
      ensureUserPersisted: jest.fn().mockResolvedValue(undefined),
    };
    const config = {
      ai: { dailyCallLimit: 2 },
    };
    const service = new AiUsageService(
      prisma as unknown as PrismaService,
      auth as unknown as AuthService,
      config as unknown as AppConfigService,
    );

    await expect(service.consume('user-1')).resolves.toBe(1);
    await expect(service.consume('user-1')).resolves.toBe(2);
    await expect(service.consume('user-1')).rejects.toMatchObject({
      code: ErrorCode.AI_RATE_LIMIT,
    });
  });
});
