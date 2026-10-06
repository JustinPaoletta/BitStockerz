import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { SimulationSettings } from './backtest-engine.types';

export const DEFAULT_SIMULATION: Readonly<SimulationSettings> = {
  allocation_pct: 100,
  commission_bps: 0,
  slippage_bps: 0,
  execution_timing: 'signal_close',
  evaluation_period: 'research',
};

export function normalizeSimulation(
  value?: Partial<SimulationSettings>,
): SimulationSettings {
  const result = { ...DEFAULT_SIMULATION, ...value };
  for (const [key, min, max] of [
    ['allocation_pct', 0.01, 100],
    ['commission_bps', 0, 1000],
    ['slippage_bps', 0, 1000],
  ] as const) {
    if (
      typeof result[key] !== 'number' ||
      !Number.isFinite(result[key]) ||
      result[key] < min ||
      result[key] > max
    ) {
      throw new DomainError(
        ErrorCode.BACKTEST_INVALID_DEFINITION,
        `${key} must be between ${min} and ${max}.`,
      );
    }
  }
  if (
    !['signal_close', 'next_open'].includes(result.execution_timing) ||
    !['research', 'out_of_sample'].includes(result.evaluation_period)
  ) {
    throw new DomainError(
      ErrorCode.BACKTEST_INVALID_DEFINITION,
      'Invalid simulation timing or evaluation period.',
    );
  }
  return result;
}
