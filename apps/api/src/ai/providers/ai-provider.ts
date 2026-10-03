import type { z } from 'zod';
import type {
  AiOperation,
  AiProviderGenerateInput,
  AiProviderGenerateResult,
} from '../ai.types';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProvider {
  readonly name: 'stub' | 'openai';

  generate<T extends z.ZodType>(
    input: AiProviderGenerateInput<T>,
  ): Promise<AiProviderGenerateResult<z.infer<T>>>;
}

export function isAiOperation(value: string): value is AiOperation {
  return (
    value === 'explain_strategy' ||
    value === 'validate_strategy' ||
    value === 'explain_backtest' ||
    value === 'suggest_improvements'
  );
}
