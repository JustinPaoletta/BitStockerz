import type { AiConfidence, AiSeverity } from './ai.types';

export interface ConfidenceInput {
  mode: 'explain' | 'validate' | 'suggest';
  hasBacktestContext?: boolean;
  deterministicSeverities: AiSeverity[];
  modelOnlyFindingCount: number;
}

/**
 * Server-computed confidence. The model never chooses the envelope value.
 *
 * - suggest without backtest → LOW
 * - any deterministic HIGH → HIGH
 * - any other deterministic finding → MEDIUM
 * - model-only findings → LOW
 * - clean explain/validate (no findings) → MEDIUM
 */
export function computeConfidence(input: ConfidenceInput): AiConfidence {
  if (input.mode === 'suggest' && !input.hasBacktestContext) {
    return 'LOW';
  }

  if (input.deterministicSeverities.includes('HIGH')) {
    return 'HIGH';
  }

  if (input.deterministicSeverities.length > 0) {
    return 'MEDIUM';
  }

  if (input.modelOnlyFindingCount > 0) {
    return 'LOW';
  }

  if (input.mode === 'suggest') {
    return 'MEDIUM';
  }

  return 'MEDIUM';
}
