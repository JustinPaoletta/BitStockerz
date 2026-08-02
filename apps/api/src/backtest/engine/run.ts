import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { StrategyDefinitionValidator } from '../../strategies/definition/strategy-definition.validator';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import { checkBudget, createExecutionBudget, elapsedBudgetMs } from './budget';
import {
  DEFAULT_BACKTEST_LIMITS,
  type BacktestEngineInput,
  type BacktestEngineOutput,
  type EngineBar,
  type ResolvedBacktestLimits,
} from './backtest-engine.types';
import { computeIndicators } from './indicators';
import { calculateMetrics } from './metrics';
import { simulateStrategy } from './simulate';

interface RunOptions {
  now?: () => number;
}

export class BacktestEngine {
  static run(input: BacktestEngineInput): BacktestEngineOutput {
    return runBacktest(input);
  }
}

export function runBacktest(
  input: BacktestEngineInput,
  options: RunOptions = {},
): BacktestEngineOutput {
  const limits = resolveLimits(input?.limits);
  const budget = createExecutionBudget(
    limits.timeoutMs,
    input?.signal,
    options.now,
  );
  checkBudget(budget, 0, true);

  assertInitialEquity(input?.initialEquity);
  assertRunnableDefinition(input?.definition);
  const bars = input?.bars;
  if (!Array.isArray(bars)) {
    throw invalidDefinition('bars must be an array.');
  }
  if (bars.length > limits.maxBars) {
    throw new DomainError(
      ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
      `Backtest contains ${bars.length} bars; the limit is ${limits.maxBars}.`,
    );
  }

  const indicatorCount = input.definition.indicators.length;
  const seriesCells = bars.length * Math.max(1, indicatorCount);
  if (
    !Number.isSafeInteger(seriesCells) ||
    seriesCells > limits.maxSeriesCells
  ) {
    throw new DomainError(
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
      `Backtest requires ${seriesCells} series cells; the limit is ${limits.maxSeriesCells}.`,
    );
  }
  if (bars.length === 0) {
    throw new DomainError(
      ErrorCode.BACKTEST_INSUFFICIENT_BARS,
      'At least one bar is required.',
    );
  }

  validateBars(bars, budget);
  const requiredBars = requiredLookback(input.definition);
  if (bars.length < requiredBars) {
    throw new DomainError(
      ErrorCode.BACKTEST_INSUFFICIENT_BARS,
      `Backtest requires at least ${requiredBars} bars for indicator warmup.`,
    );
  }

  const indicators = computeIndicators(
    input.definition.indicators,
    bars,
    budget,
  );
  const simulation = simulateStrategy(
    input.definition,
    bars,
    indicators,
    input.initialEquity,
    input.symbolId,
    budget,
  );
  const metrics = calculateMetrics(
    input.initialEquity,
    simulation.trades,
    simulation.equityCurve,
    budget,
  );
  checkBudget(budget, bars.length, true);

  return {
    trades: simulation.trades,
    equityCurve: simulation.equityCurve,
    metrics,
    diagnostics: {
      barsProcessed: bars.length,
      durationMs: elapsedBudgetMs(budget),
      indicatorsComputed: indicatorCount,
      signalsFired: simulation.signalsFired,
    },
  };
}

function resolveLimits(
  limits: BacktestEngineInput['limits'],
): ResolvedBacktestLimits {
  const resolved = {
    maxBars: limits?.maxBars ?? DEFAULT_BACKTEST_LIMITS.maxBars,
    timeoutMs: limits?.timeoutMs ?? DEFAULT_BACKTEST_LIMITS.timeoutMs,
    maxSeriesCells:
      limits?.maxSeriesCells ?? DEFAULT_BACKTEST_LIMITS.maxSeriesCells,
  };
  for (const [name, value] of Object.entries(resolved)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw invalidDefinition(`${name} must be a positive integer.`);
    }
  }
  return resolved;
}

function assertInitialEquity(value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw invalidDefinition('initialEquity must be a positive finite number.');
  }
}

function assertRunnableDefinition(definition: StrategyDefinition): void {
  const candidate = withDefensiveRiskDefaults(definition);
  const validation = StrategyDefinitionValidator.validate(candidate);
  if (!validation.is_valid) {
    const first = validation.errors[0];
    const location = first.path ? ` at ${first.path}` : '';
    throw invalidDefinition(
      `Invalid backtest definition${location}: ${first.message}`,
    );
  }
}

function withDefensiveRiskDefaults(definition: unknown): unknown {
  if (!isPlainObject(definition)) {
    return definition;
  }
  const risk = definition.risk;
  if (risk !== undefined && !isPlainObject(risk)) {
    return definition;
  }
  const riskObject = risk ?? {};
  return {
    ...definition,
    risk: {
      ...riskObject,
      stop_loss: riskObject.stop_loss ?? { type: 'percent', value: 1 },
      take_profit: riskObject.take_profit ?? { type: 'percent', value: 1 },
    },
  };
}

function requiredLookback(definition: StrategyDefinition): number {
  return definition.indicators.reduce(
    (required, indicator) =>
      Math.max(
        required,
        indicator.type === 'RSI'
          ? indicator.params.period + 1
          : indicator.params.period,
      ),
    1,
  );
}

function validateBars(
  bars: readonly EngineBar[],
  budget: ReturnType<typeof createExecutionBudget>,
): void {
  let previousTimestamp = Number.NEGATIVE_INFINITY;
  bars.forEach((bar, index) => {
    checkBudget(budget, index);
    if (!bar || typeof bar !== 'object' || Array.isArray(bar)) {
      throw invalidDefinition(`Bar ${index} must be an object.`);
    }
    if (!(bar.ts instanceof Date) || !Number.isFinite(bar.ts.getTime())) {
      throw invalidDefinition(`Bar ${index} has an invalid timestamp.`);
    }
    const timestamp = bar.ts.getTime();
    if (timestamp <= previousTimestamp) {
      throw invalidDefinition(
        'Bar timestamps must be strictly ascending with no duplicates.',
      );
    }
    previousTimestamp = timestamp;

    for (const field of ['open', 'high', 'low', 'close', 'volume'] as const) {
      if (typeof bar[field] !== 'number' || !Number.isFinite(bar[field])) {
        throw invalidDefinition(`Bar ${index}.${field} must be finite.`);
      }
    }
    if (bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0) {
      throw invalidDefinition(`Bar ${index} prices must be positive.`);
    }
    if (bar.volume < 0) {
      throw invalidDefinition(`Bar ${index}.volume must be non-negative.`);
    }
    if (
      bar.low > Math.min(bar.open, bar.close) ||
      Math.max(bar.open, bar.close) > bar.high
    ) {
      throw invalidDefinition(`Bar ${index} has inconsistent OHLC values.`);
    }
  });
  checkBudget(budget, bars.length, true);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  return (
    Reflect.getPrototypeOf(value) === null ||
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

function invalidDefinition(message: string): DomainError {
  return new DomainError(ErrorCode.BACKTEST_INVALID_DEFINITION, message);
}
