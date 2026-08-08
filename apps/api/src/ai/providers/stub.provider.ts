import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type {
  AiProviderGenerateInput,
  AiProviderGenerateResult,
} from '../ai.types';
import type { AiProvider } from './ai-provider';

@Injectable()
export class StubProvider implements AiProvider {
  readonly name = 'stub' as const;

  generate<T extends z.ZodType>(
    input: AiProviderGenerateInput<T>,
  ): Promise<AiProviderGenerateResult<z.infer<T>>> {
    const stub = buildStubOutput(input.operation, input.stubContext ?? {});
    const output = input.schema.parse(stub);
    return Promise.resolve({
      output,
      model: 'stub',
      finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
  }
}

function buildStubOutput(
  operation: string,
  context: Record<string, unknown>,
): Record<string, unknown> {
  const name =
    typeof context.strategy_name === 'string'
      ? context.strategy_name
      : 'strategy';
  const runId =
    typeof context.backtest_run_id === 'string'
      ? context.backtest_run_id
      : 'run';

  switch (operation) {
    case 'explain_strategy':
      return {
        explanation: `Stub explanation for ${name}: entry and exit rules are summarized without placing trades.`,
        warnings: [],
      };
    case 'validate_strategy':
      return {
        warnings: [],
      };
    case 'explain_backtest':
      return {
        explanation: `Stub explanation for backtest ${runId}: metrics are informational only.`,
        issues: [],
      };
    case 'suggest_improvements':
      return {
        suggestions: [
          {
            code: 'REVIEW_RISK_PARAMETERS',
            title: 'Review risk parameters',
            description:
              'Stub suggestion: confirm stop-loss and take-profit distances fit the strategy horizon.',
            evidence: ['stub=true'],
          },
        ],
      };
    default:
      return {};
  }
}
