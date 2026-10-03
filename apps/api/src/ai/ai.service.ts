import { Inject, Injectable, Logger } from '@nestjs/common';
import type { z } from 'zod';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import { AuditService } from '../observability/audit.service';
import { computeConfidence, type ConfidenceInput } from './ai-confidence';
import { AiUsageService } from './ai-usage.service';
import {
  AI_DISCLAIMER,
  createAiRequestId,
  sha256Hex,
  type AiConfidence,
  type AiOperation,
  type AiResponseEnvelope,
} from './ai.types';
import { AI_PROVIDER, type AiProvider } from './providers/ai-provider';

export interface AiInvokeInput<Schema extends z.ZodType> {
  userId: string;
  operation: AiOperation;
  schema: Schema;
  system: string;
  prompt: string;
  confidence: ConfidenceInput;
  stubContext?: Record<string, unknown>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly usage: AiUsageService,
    private readonly audit: AuditService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  async invoke<Schema extends z.ZodType>(
    input: AiInvokeInput<Schema>,
  ): Promise<z.infer<Schema> & AiResponseEnvelope> {
    if (!this.config.ai.enabled) {
      throw new DomainError(ErrorCode.AI_DISABLED);
    }

    await this.usage.consume(input.userId);

    const aiRequestId = createAiRequestId();
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.ai.timeoutMs,
    );

    let success = false;
    let model = this.config.ai.model;
    let finishReason: string | undefined;
    let tokenUsage:
      | {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
        }
      | undefined;

    try {
      const result = await this.provider.generate({
        operation: input.operation,
        schema: input.schema,
        system: input.system,
        prompt: input.prompt,
        signal: controller.signal,
        model: this.config.ai.model,
        maxOutputTokens: this.config.ai.maxOutputTokens,
        maxRetries: this.config.ai.maxRetries,
        stubContext: input.stubContext,
      });

      success = true;
      model = result.model;
      finishReason = result.finishReason;
      tokenUsage = result.usage;

      const confidence: AiConfidence = computeConfidence(input.confidence);
      return {
        ...(result.output as object),
        disclaimer: AI_DISCLAIMER,
        confidence,
        ai_request_id: aiRequestId,
      } as z.infer<Schema> & AiResponseEnvelope;
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      if (controller.signal.aborted || isAbortError(error)) {
        throw new DomainError(ErrorCode.AI_TIMEOUT);
      }
      throw new DomainError(ErrorCode.AI_PROVIDER_ERROR);
    } finally {
      clearTimeout(timeout);
      const latencyMs = Date.now() - started;
      this.logInvocation({
        userId: input.userId,
        operation: input.operation,
        aiRequestId,
        latencyMs,
        prompt: input.prompt,
        success,
        model,
        finishReason,
        tokenUsage,
      });
      void this.audit.record({
        userId: input.userId,
        eventType: 'ai.invocation',
        payload: {
          ai_request_id: aiRequestId,
          operation: input.operation,
          provider: this.provider.name,
          model,
          success,
          latency_ms: latencyMs,
          input_tokens: tokenUsage?.inputTokens,
          output_tokens: tokenUsage?.outputTokens,
          total_tokens: tokenUsage?.totalTokens,
        },
      });
    }
  }

  private logInvocation(fields: {
    userId: string;
    operation: AiOperation;
    aiRequestId: string;
    latencyMs: number;
    prompt: string;
    success: boolean;
    model: string;
    finishReason?: string;
    tokenUsage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }): void {
    const base = {
      event: 'ai.invocation',
      provider: this.provider.name,
      model: fields.model,
      user_id: fields.userId,
      operation: fields.operation,
      latency_ms: fields.latencyMs,
      prompt_chars: fields.prompt.length,
      prompt_sha256: sha256Hex(fields.prompt),
      success: fields.success,
      ai_request_id: fields.aiRequestId,
      finish_reason: fields.finishReason,
      input_tokens: fields.tokenUsage?.inputTokens,
      output_tokens: fields.tokenUsage?.outputTokens,
      total_tokens: fields.tokenUsage?.totalTokens,
    };

    if (
      this.config.ai.logContent &&
      this.config.server.nodeEnv !== 'production'
    ) {
      this.logger.debug({
        ...base,
        prompt_preview: fields.prompt.slice(0, 2000),
      });
      return;
    }

    this.logger.log(base);
  }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  return name === 'AbortError' || name === 'TimeoutError';
}
