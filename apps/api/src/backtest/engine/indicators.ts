import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type {
  PriceSource,
  StrategyIndicator,
} from '../../strategies/definition/strategy-definition.types';
import { checkBudget, type ExecutionBudget } from './budget';
import type { EngineBar } from './backtest-engine.types';

export type IndicatorSeries = Record<string, Array<number | null>>;

export function computeIndicators(
  indicators: readonly StrategyIndicator[],
  bars: readonly EngineBar[],
  budget?: ExecutionBudget,
): IndicatorSeries {
  const result = Object.create(null) as IndicatorSeries;

  indicators.forEach((indicator, index) => {
    checkBudget(budget, index);
    assertIndicator(indicator);
    if (Object.hasOwn(result, indicator.id)) {
      throw invalidDefinition(`Indicator id "${indicator.id}" is duplicated.`);
    }

    const values = sourceValues(bars, indicator.source, budget);
    switch (indicator.type) {
      case 'SMA':
        result[indicator.id] = simpleMovingAverage(
          values,
          indicator.params.period,
          budget,
        );
        break;
      case 'EMA':
        result[indicator.id] = exponentialMovingAverage(
          values,
          indicator.params.period,
          budget,
        );
        break;
      case 'RSI':
        result[indicator.id] = relativeStrengthIndex(
          values,
          indicator.params.period,
          budget,
        );
        break;
      default:
        throw invalidDefinition(
          `Unknown indicator type "${String(indicator.type)}".`,
        );
    }
  });

  checkBudget(budget, indicators.length, true);
  return result;
}

export function simpleMovingAverage(
  values: readonly number[],
  period: number,
  budget?: ExecutionBudget,
): Array<number | null> {
  assertPeriod(period);
  const output = Array<number | null>(values.length).fill(null);
  let rollingSum = 0;

  for (let index = 0; index < values.length; index += 1) {
    checkBudget(budget, index);
    rollingSum += values[index];
    if (index >= period) {
      rollingSum -= values[index - period];
    }
    if (index >= period - 1) {
      output[index] = rollingSum / period;
    }
  }

  return output;
}

export function exponentialMovingAverage(
  values: readonly number[],
  period: number,
  budget?: ExecutionBudget,
): Array<number | null> {
  assertPeriod(period);
  const output = Array<number | null>(values.length).fill(null);
  if (values.length < period) {
    return output;
  }

  let seedSum = 0;
  for (let index = 0; index < period; index += 1) {
    checkBudget(budget, index);
    seedSum += values[index];
  }

  // Seed with the first period's SMA, then use the standard recursive EMA.
  const multiplier = 2 / (period + 1);
  let previous = seedSum / period;
  output[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    checkBudget(budget, index);
    previous = (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

export function relativeStrengthIndex(
  values: readonly number[],
  period: number,
  budget?: ExecutionBudget,
): Array<number | null> {
  assertPeriod(period);
  const output = Array<number | null>(values.length).fill(null);
  if (values.length <= period) {
    return output;
  }

  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    checkBudget(budget, index);
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] = rsiValue(averageGain, averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    checkBudget(budget, index);
    const change = values[index] - values[index - 1];
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    output[index] = rsiValue(averageGain, averageLoss);
  }

  return output;
}

function rsiValue(averageGain: number, averageLoss: number): number {
  if (averageGain === 0 && averageLoss === 0) {
    return 50;
  }
  if (averageLoss === 0) {
    return 100;
  }
  if (averageGain === 0) {
    return 0;
  }
  const relativeStrength = averageGain / averageLoss;
  return 100 - 100 / (1 + relativeStrength);
}

function sourceValues(
  bars: readonly EngineBar[],
  source: PriceSource,
  budget?: ExecutionBudget,
): number[] {
  if (!['open', 'high', 'low', 'close'].includes(source)) {
    throw invalidDefinition(`Unknown indicator source "${String(source)}".`);
  }
  return bars.map((bar, index) => {
    checkBudget(budget, index);
    return bar[source];
  });
}

function assertIndicator(indicator: StrategyIndicator): void {
  if (
    !indicator ||
    typeof indicator.id !== 'string' ||
    indicator.id.length === 0
  ) {
    throw invalidDefinition('Each indicator requires a non-empty id.');
  }
  assertPeriod(indicator.params?.period);
}

function assertPeriod(period: number): void {
  if (!Number.isInteger(period) || period <= 0) {
    throw invalidDefinition('Indicator period must be a positive integer.');
  }
}

function invalidDefinition(message: string): DomainError {
  return new DomainError(ErrorCode.BACKTEST_INVALID_DEFINITION, message);
}
