import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { AppConfigService } from '../../config/app-config.service';
import type {
  AiProviderGenerateInput,
  AiProviderGenerateResult,
} from '../ai.types';
import type { AiProvider } from './ai-provider';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai' as const;

  constructor(private readonly config: AppConfigService) {}

  async generate<T extends z.ZodType>(
    input: AiProviderGenerateInput<T>,
  ): Promise<AiProviderGenerateResult<z.infer<T>>> {
    const apiKey = this.config.ai.openaiApiKey;
    if (!apiKey) {
      throw new DomainError(
        ErrorCode.AI_PROVIDER_ERROR,
        'OPENAI_API_KEY is not configured.',
      );
    }

    // Dynamic import keeps the ESM AI SDK off the Jest CJS module graph until
    // a live OpenAI call is actually made.
    const [{ generateText, Output, APICallError }, { createOpenAI }] =
      await Promise.all([import('ai'), import('@ai-sdk/openai')]);

    const openai = createOpenAI({ apiKey });

    try {
      const result = await generateText({
        model: openai(input.model),
        system: input.system,
        prompt: input.prompt,
        maxOutputTokens: input.maxOutputTokens,
        maxRetries: input.maxRetries,
        abortSignal: input.signal,
        output: Output.object({ schema: input.schema }),
      });

      if (result.output === undefined || result.output === null) {
        throw new DomainError(
          ErrorCode.AI_PROVIDER_ERROR,
          'AI provider returned no structured output.',
        );
      }

      return {
        output: result.output as z.infer<T>,
        model: input.model,
        finishReason:
          typeof result.finishReason === 'string'
            ? result.finishReason
            : undefined,
        usage: {
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
        },
      };
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      if (isAbortError(error) || input.signal?.aborted) {
        throw new DomainError(
          ErrorCode.AI_TIMEOUT,
          'The Kernel AI provider exceeded its deadline.',
        );
      }
      if (APICallError.isInstance(error) && error.statusCode === 408) {
        throw new DomainError(ErrorCode.AI_TIMEOUT);
      }
      throw new DomainError(
        ErrorCode.AI_PROVIDER_ERROR,
        'The Kernel AI provider failed to produce a valid response.',
      );
    }
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}
