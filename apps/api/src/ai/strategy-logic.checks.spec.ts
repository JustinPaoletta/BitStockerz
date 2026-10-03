import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import type { StrategyDefinition } from '../strategies/definition/strategy-definition.types';
import { mergeWarnings, runStrategyLogicChecks } from './strategy-logic.checks';

function baseDefinition(): StrategyDefinition {
  return {
    indicators: [
      { id: 'sma', type: 'SMA', params: { period: 20 }, source: 'close' },
      { id: 'unused', type: 'EMA', params: { period: 50 }, source: 'close' },
    ],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'sma' },
          op: 'gt',
          right: { literal: 100 },
        },
        {
          left: { indicator: 'sma' },
          op: 'lt',
          right: { literal: 50 },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'sma' },
          op: 'gt',
          right: { literal: 100 },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 5 },
      take_profit: { type: 'percent', value: 2 },
    },
  };
}

describe('runStrategyLogicChecks', () => {
  it('detects conflict, unsatisfiable range, unreferenced indicator, and risk/reward', () => {
    const warnings = runStrategyLogicChecks(baseDefinition());
    const codes = warnings.map((warning) => warning.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'ENTRY_EXIT_CONFLICT',
        'UNSATISFIABLE_RANGE',
        'UNREFERENCED_INDICATOR',
        'RISK_REWARD_NOT_POSITIVE',
      ]),
    );
  });

  it('detects duplicate conditions', () => {
    const definition = baseDefinition();
    definition.entry.conditions = [
      {
        left: { indicator: 'sma' },
        op: 'gt',
        right: { literal: 10 },
      },
      {
        left: { indicator: 'sma' },
        op: 'gt',
        right: { literal: 10 },
      },
    ];
    definition.exit.conditions = [
      {
        left: { price: 'close' },
        op: 'lt',
        right: { literal: 0 },
      },
    ];
    definition.risk.take_profit.value = 10;
    const warnings = runStrategyLogicChecks(definition);
    expect(warnings.map((item) => item.code)).toContain('DUPLICATE_CONDITION');
  });

  it('treats inclusive equal bounds as satisfiable', () => {
    const definition = baseDefinition();
    definition.indicators = [
      { id: 'sma', type: 'SMA', params: { period: 20 }, source: 'close' },
    ];
    definition.entry.conditions = [
      { left: { indicator: 'sma' }, op: 'gte', right: { literal: 10 } },
      { left: { indicator: 'sma' }, op: 'lte', right: { literal: 10 } },
    ];
    definition.exit.conditions = [
      { left: { price: 'close' }, op: 'lt', right: { literal: 0 } },
    ];
    definition.risk.take_profit.value = 10;
    const codes = runStrategyLogicChecks(definition).map((item) => item.code);
    expect(codes).not.toContain('UNSATISFIABLE_RANGE');
  });
});

describe('mergeWarnings', () => {
  it('keeps deterministic severity and demotes model-only HIGH', () => {
    const merged = mergeWarnings(
      [
        {
          code: 'ENTRY_EXIT_CONFLICT',
          severity: 'HIGH',
          message: 'deterministic',
          evidence_paths: ['entry.conditions[0]', 'exit.conditions[0]'],
        },
      ],
      [
        {
          code: 'ENTRY_EXIT_CONFLICT',
          severity: 'LOW',
          message: 'model',
          evidence_paths: ['entry.conditions[0]', 'exit.conditions[0]'],
        },
        {
          code: 'MODEL_ONLY',
          severity: 'HIGH',
          message: 'model only',
          evidence_paths: ['entry'],
        },
      ],
    );

    expect(merged).toEqual([
      expect.objectContaining({
        code: 'ENTRY_EXIT_CONFLICT',
        severity: 'HIGH',
        message: 'deterministic',
      }),
      expect.objectContaining({
        code: 'MODEL_ONLY',
        severity: 'MEDIUM',
      }),
    ]);
  });
});

describe('DomainError AI codes', () => {
  it('maps AI codes to expected statuses', () => {
    expect(new DomainError(ErrorCode.AI_DISABLED).statusCode).toBe(503);
    expect(new DomainError(ErrorCode.AI_RATE_LIMIT).statusCode).toBe(429);
    expect(new DomainError(ErrorCode.AI_PROVIDER_ERROR).statusCode).toBe(502);
    expect(new DomainError(ErrorCode.AI_TIMEOUT).statusCode).toBe(504);
  });
});
