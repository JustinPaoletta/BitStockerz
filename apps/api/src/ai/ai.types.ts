import { createHash, randomUUID } from 'crypto';
import type { z } from 'zod';

export const AI_DISCLAIMER =
  'Not financial advice. Kernel suggestions are informational only.';

export const AI_OPERATIONS = [
  'explain_strategy',
  'validate_strategy',
  'explain_backtest',
  'suggest_improvements',
] as const;

export type AiOperation = (typeof AI_OPERATIONS)[number];

export type AiConfidence = 'LOW' | 'MEDIUM' | 'HIGH';
export type AiSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AiResponseEnvelope {
  disclaimer: string;
  confidence: AiConfidence;
  ai_request_id: string;
}

export type AiResponse<T> = T & AiResponseEnvelope;

export interface AiWarning {
  code: string;
  severity: AiSeverity;
  message: string;
  evidence_paths: string[];
}

export interface AiIssue {
  code: string;
  severity: AiSeverity;
  message: string;
  evidence: string[];
}

export interface AiSuggestion {
  code: string;
  title: string;
  description: string;
  evidence: string[];
}

export interface AiProviderGenerateInput<T extends z.ZodType> {
  operation: AiOperation;
  schema: T;
  system: string;
  prompt: string;
  signal?: AbortSignal;
  model: string;
  maxOutputTokens: number;
  maxRetries: number;
  stubContext?: Record<string, unknown>;
}

export interface AiProviderGenerateResult<T> {
  output: T;
  model: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export function createAiRequestId(): string {
  return randomUUID();
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function utcDateOnly(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function utcDateKey(now = new Date()): string {
  return utcDateOnly(now).toISOString().slice(0, 10);
}
