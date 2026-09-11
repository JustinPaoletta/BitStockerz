import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { AppConfigService } from '../config/app-config.service';
import type { AuditService } from '../observability/audit.service';
import { AiService } from './ai.service';
import { AiUsageService } from './ai-usage.service';
import { explainStrategyOutputSchema } from './schemas/ai-output.schemas';
import type { AiProvider } from './providers/ai-provider';
import { StubProvider } from './providers/stub.provider';

function config(overrides: Record<string, unknown> = {}): AppConfigService {
  return {
    server: { nodeEnv: 'test', port: 4000, corsAllowedOrigins: [] },
    ai: {
      enabled: true,
      provider: 'stub',
      model: 'gpt-4.1-mini',
      dailyCallLimit: 2,
      timeoutMs: 1000,
      maxRetries: 0,
      maxOutputTokens: 500,
      maxContextChars: 12000,
      logContent: false,
      diffSuggestionsEnabled: false,
      ...overrides,
    },
  } as unknown as AppConfigService;
}

describe('AiService', () => {
  it('short-circuits when AI is disabled without consuming quota', async () => {
    const usage = {
      consume: jest.fn(),
    } as unknown as AiUsageService;
    const audit = { record: jest.fn() } as unknown as AuditService;
    const provider: AiProvider = new StubProvider();
    const service = new AiService(
      config({ enabled: false }),
      usage,
      audit,
      provider,
    );

    await expect(
      service.invoke({
        userId: 'user-1',
        operation: 'explain_strategy',
        schema: explainStrategyOutputSchema,
        system: 'system',
        prompt: 'prompt',
        confidence: {
          mode: 'explain',
          deterministicSeverities: [],
          modelOnlyFindingCount: 0,
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_DISABLED });
    expect(usage.consume).not.toHaveBeenCalled();
  });

  it('returns envelope fields and audits metadata only', async () => {
    const usage = {
      consume: jest.fn().mockResolvedValue(1),
    } as unknown as AiUsageService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AiService(
      config(),
      usage,
      audit as unknown as AuditService,
      new StubProvider(),
    );

    const response = await service.invoke({
      userId: 'user-1',
      operation: 'explain_strategy',
      schema: explainStrategyOutputSchema,
      system: 'system',
      prompt: 'secret prompt body',
      confidence: {
        mode: 'explain',
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      },
      stubContext: { strategy_name: 'Alpha' },
    });

    expect(response).toMatchObject({
      disclaimer: expect.stringContaining('Not financial advice'),
      confidence: 'MEDIUM',
      explanation: expect.stringContaining('Alpha'),
      warnings: [],
    });
    expect(response.ai_request_id).toEqual(expect.any(String));
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'ai.invocation',
        payload: expect.not.objectContaining({
          prompt: expect.anything(),
          response: expect.anything(),
        }),
      }),
    );
    const payload = audit.record.mock.calls[0][0].payload as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty('prompt');
    expect(JSON.stringify(payload)).not.toContain('secret prompt body');
  });

  it('maps provider failures after quota consumption', async () => {
    const usage = {
      consume: jest.fn().mockResolvedValue(1),
    } as unknown as AiUsageService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const provider: AiProvider = {
      name: 'openai',
      generate: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const service = new AiService(
      config({ provider: 'openai' }),
      usage,
      audit as unknown as AuditService,
      provider,
    );

    await expect(
      service.invoke({
        userId: 'user-1',
        operation: 'explain_strategy',
        schema: explainStrategyOutputSchema,
        system: 'system',
        prompt: 'prompt',
        confidence: {
          mode: 'explain',
          deterministicSeverities: [],
          modelOnlyFindingCount: 0,
        },
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect(usage.consume).toHaveBeenCalled();
  });

  it('maps abort to AI_TIMEOUT and supports content logging', async () => {
    const usage = {
      consume: jest.fn().mockResolvedValue(1),
    } as unknown as AiUsageService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const provider: AiProvider = {
      name: 'openai',
      generate: jest.fn().mockImplementation(async ({ signal }) => {
        signal?.addEventListener('abort', () => undefined);
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    };
    const service = new AiService(
      config({ provider: 'openai', timeoutMs: 1, logContent: true }),
      usage,
      audit as unknown as AuditService,
      provider,
    );

    await expect(
      service.invoke({
        userId: 'user-1',
        operation: 'explain_strategy',
        schema: explainStrategyOutputSchema,
        system: 'system',
        prompt: 'prompt-body',
        confidence: {
          mode: 'explain',
          deterministicSeverities: [],
          modelOnlyFindingCount: 0,
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_TIMEOUT });
  });

  it('rethrows DomainError from the provider', async () => {
    const usage = {
      consume: jest.fn().mockResolvedValue(1),
    } as unknown as AiUsageService;
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const provider: AiProvider = {
      name: 'stub',
      generate: jest
        .fn()
        .mockRejectedValue(new DomainError(ErrorCode.AI_PROVIDER_ERROR)),
    };
    const service = new AiService(
      config(),
      usage,
      audit as unknown as AuditService,
      provider,
    );

    await expect(
      service.invoke({
        userId: 'user-1',
        operation: 'explain_strategy',
        schema: explainStrategyOutputSchema,
        system: 'system',
        prompt: 'prompt',
        confidence: {
          mode: 'explain',
          deterministicSeverities: [],
          modelOnlyFindingCount: 0,
        },
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AI_PROVIDER_ERROR });
  });
});

describe('AiUsageService in-memory', () => {
  it('enforces the daily limit', async () => {
    const service = new AiUsageService(
      { isEnabled: false } as never,
      {} as never,
      config({ dailyCallLimit: 1 }),
    );

    await expect(service.consume('user-a')).resolves.toBe(1);
    await expect(service.consume('user-a')).rejects.toMatchObject({
      code: ErrorCode.AI_RATE_LIMIT,
    });
  });
});
