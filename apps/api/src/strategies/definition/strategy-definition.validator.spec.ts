import { INDICATOR_CATALOG } from './indicator-catalog';
import {
  StrategyDefinitionValidator,
  TAKE_PROFIT_MAX_PERCENT,
} from './strategy-definition.validator';
import type { StrategyDefinition } from './strategy-definition.types';

function validDefinition(): StrategyDefinition {
  return {
    indicators: [
      {
        id: 'sma_fast',
        type: 'SMA',
        params: { period: 10 },
        source: 'close',
      },
      {
        id: 'sma_slow',
        type: 'EMA',
        params: { period: 30 },
        source: 'open',
      },
      {
        id: 'rsi',
        type: 'RSI',
        params: { period: 14 },
        source: 'close',
      },
    ],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'sma_fast' },
          op: 'crosses_above',
          right: { indicator: 'sma_slow' },
        },
        {
          left: { indicator: 'rsi' },
          op: 'lt',
          right: { literal: 70 },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'crosses_below',
          right: { literal: 100 },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 2 },
      take_profit: { type: 'percent', value: TAKE_PROFIT_MAX_PERCENT },
    },
  };
}

function validateWith(mutate: (definition: Record<string, any>) => void) {
  const definition = structuredClone(validDefinition()) as Record<string, any>;
  mutate(definition);
  return StrategyDefinitionValidator.validate(definition);
}

function errorCodes(
  mutate: (definition: Record<string, any>) => void,
): string[] {
  return validateWith(mutate).errors.map((error) => error.code);
}

describe('StrategyDefinitionValidator', () => {
  it('accepts the canonical definition and the 500% take-profit ceiling', () => {
    expect(StrategyDefinitionValidator.validate(validDefinition())).toEqual({
      is_valid: true,
      errors: [],
    });
  });

  it('uses catalog parameter bounds as the validator source of truth', () => {
    for (const entry of INDICATOR_CATALOG) {
      const valid = validDefinition();
      valid.indicators = [
        {
          id: 'indicator',
          type: entry.key,
          params: { period: entry.params[0].max },
          source: entry.default_source,
        },
      ];
      valid.entry.conditions = [
        {
          left: { indicator: 'indicator' },
          op: 'gt',
          right: { literal: 0 },
        },
      ];
      valid.exit.conditions = [
        {
          left: { indicator: 'indicator' },
          op: 'lt',
          right: { literal: 0 },
        },
      ];
      expect(StrategyDefinitionValidator.validate(valid).is_valid).toBe(true);

      valid.indicators[0].params.period = entry.params[0].max + 1;
      expect(StrategyDefinitionValidator.validate(valid).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'indicators[0].params.period',
            code: 'PARAMETER_OUT_OF_RANGE',
          }),
        ]),
      );
    }
  });

  it.each([
    ['null', null],
    ['array', []],
    ['string', 'definition'],
  ])('rejects a %s definition root', (_name, value) => {
    expect(StrategyDefinitionValidator.validate(value)).toEqual({
      is_valid: false,
      errors: [
        {
          path: '',
          code: 'INVALID_DEFINITION',
          message: 'Definition must be a non-null object.',
        },
      ],
    });
  });

  it('rejects missing and unknown keys at every object level', () => {
    const result = validateWith((definition) => {
      delete definition.exit;
      definition.extra = true;
      definition.entry.extra = true;
      delete definition.risk.take_profit;
      definition.indicators[0].params.window = 10;
      definition.entry.conditions[0].left.extra = true;
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'extra', code: 'UNKNOWN_KEY' }),
        expect.objectContaining({
          path: 'entry.extra',
          code: 'UNKNOWN_KEY',
        }),
        expect.objectContaining({
          path: 'indicators[0].params.window',
          code: 'UNKNOWN_KEY',
        }),
        expect.objectContaining({
          path: 'entry.conditions[0].left.extra',
          code: 'UNKNOWN_KEY',
        }),
        expect.objectContaining({
          path: 'risk.take_profit',
          code: 'REQUIRED_FIELD',
        }),
        expect.objectContaining({ path: 'exit', code: 'REQUIRED_FIELD' }),
      ]),
    );
  });

  it.each([
    ['indicators', (d: Record<string, any>) => (d.indicators = {})],
    ['indicator', (d: Record<string, any>) => (d.indicators[0] = [])],
    ['params', (d: Record<string, any>) => (d.indicators[0].params = [])],
    ['entry', (d: Record<string, any>) => (d.entry = [])],
    ['conditions', (d: Record<string, any>) => (d.entry.conditions = {})],
    ['condition', (d: Record<string, any>) => (d.entry.conditions[0] = [])],
    ['risk', (d: Record<string, any>) => (d.risk = [])],
    ['risk rule', (d: Record<string, any>) => (d.risk.stop_loss = [])],
  ])('rejects array/object confusion for %s', (_name, mutate) => {
    expect(errorCodes(mutate)).toContain('INVALID_TYPE');
  });

  it('enforces indicator count, id format, uniqueness, and catalog types', () => {
    const result = validateWith((definition) => {
      definition.indicators = Array.from({ length: 21 }, (_, index) => ({
        id: index === 1 ? 'duplicate' : index === 2 ? 'duplicate' : `i${index}`,
        type: index === 3 ? 'MACD' : 'SMA',
        params: { period: 20 },
        source: 'close',
      }));
      definition.indicators[0].id = '1bad id';
    });
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'TOO_MANY_INDICATORS',
        'INVALID_INDICATOR_ID',
        'DUPLICATE_INDICATOR_ID',
        'UNKNOWN_INDICATOR',
      ]),
    );
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, '14'])(
    'rejects non-integer period %p',
    (period) => {
      expect(
        errorCodes(
          (definition) => (definition.indicators[0].params.period = period),
        ),
      ).toContain('INVALID_PARAMETER');
    },
  );

  it('rejects invalid, unsupported, and missing indicator sources', () => {
    const invalid = validateWith(
      (definition) => (definition.indicators[0].source = 'volume'),
    );
    expect(invalid.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_SOURCE' }),
      ]),
    );

    const unsupported = validateWith(
      (definition) => (definition.indicators[2].source = 'open'),
    );
    expect(unsupported.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'indicators[2].source',
          code: 'INVALID_SOURCE',
        }),
      ]),
    );

    const missing = validateWith(
      (definition) => delete definition.indicators[0].source,
    );
    expect(missing.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'indicators[0].source',
          code: 'REQUIRED_FIELD',
        }),
      ]),
    );
  });

  it('rejects OR, empty groups, and groups above ten conditions', () => {
    const orResult = validateWith(
      (definition) => (definition.entry.logic = 'OR'),
    );
    expect(orResult.errors[0]).toMatchObject({
      path: 'entry.logic',
      code: 'OR_NOT_SUPPORTED',
    });

    expect(
      errorCodes((definition) => (definition.exit.conditions = [])),
    ).toContain('EMPTY_CONDITIONS');
    expect(
      errorCodes(
        (definition) =>
          (definition.exit.conditions = Array(11).fill({
            left: { price: 'close' },
            op: 'gt',
            right: { literal: 1 },
          })),
      ),
    ).toContain('TOO_MANY_CONDITIONS');
  });

  it('accepts every operator and rejects an unknown operator', () => {
    const operators = [
      'gt',
      'gte',
      'lt',
      'lte',
      'eq',
      'crosses_above',
      'crosses_below',
    ];
    for (const operator of operators) {
      const result = validateWith(
        (definition) =>
          (definition.entry.conditions[0] = {
            left: { price: 'close' },
            op: operator,
            right: { literal: 1 },
          }),
      );
      expect(result.errors).toEqual([]);
    }
    expect(
      errorCodes(
        (definition) => (definition.entry.conditions[0].op = 'contains'),
      ),
    ).toContain('UNKNOWN_OPERATOR');
  });

  it('requires crossover conditions to include a dynamic operand', () => {
    const literalCross = validateWith(
      (definition) =>
        (definition.entry.conditions[0] = {
          left: { literal: 1 },
          op: 'crosses_above',
          right: { literal: 2 },
        }),
    );
    expect(literalCross.errors).toEqual([
      expect.objectContaining({
        path: 'entry.conditions[0].op',
        code: 'CROSS_REQUIRES_DYNAMIC_OPERAND',
      }),
    ]);

    const dynamicCross = validateWith(
      (definition) =>
        (definition.entry.conditions[0] = {
          left: { price: 'close' },
          op: 'crosses_above',
          right: { literal: 2 },
        }),
    );
    expect(dynamicCross.is_valid).toBe(true);
  });

  it('validates operand one-of shape and values', () => {
    const result = validateWith((definition) => {
      definition.entry.conditions = [
        {
          left: { literal: Number.NaN },
          op: 'gt',
          right: { indicator: 'missing' },
        },
        {
          left: { price: 'volume' },
          op: 'lt',
          right: { literal: 1, price: 'close', extra: true },
        },
        { left: null, op: 'eq', right: {} },
      ];
    });
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'INVALID_LITERAL',
        'UNKNOWN_INDICATOR_REFERENCE',
        'INVALID_PRICE_SOURCE',
        'UNKNOWN_KEY',
        'INVALID_OPERAND',
      ]),
    );
  });

  it('rejects risk types, non-finite amounts, and values outside each bound', () => {
    expect(
      errorCodes((definition) => (definition.risk.stop_loss.type = 'atr')),
    ).toContain('INVALID_RISK_TYPE');
    for (const value of [0, -1, 50.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        errorCodes((definition) => (definition.risk.stop_loss.value = value)),
      ).toContain('RISK_VALUE_OUT_OF_RANGE');
    }
    expect(
      errorCodes(
        (definition) =>
          (definition.risk.take_profit.value = TAKE_PROFIT_MAX_PERCENT + 0.01),
      ),
    ).toContain('RISK_VALUE_OUT_OF_RANGE');
  });

  it('returns errors in deterministic depth-first document order', () => {
    const definition = {
      entry: {
        logic: 'OR',
        conditions: [
          { left: { price: 'volume' }, op: 'bad', right: { literal: 1 } },
        ],
      },
      indicators: [
        {
          id: '1bad',
          type: 'SMA',
          params: { period: 201 },
          source: 'close',
        },
      ],
      risk: {
        stop_loss: { type: 'atr', value: 0 },
      },
    };
    const first = StrategyDefinitionValidator.validate(definition);
    const second = StrategyDefinitionValidator.validate(
      structuredClone(definition),
    );

    expect(second).toEqual(first);
    expect(first.errors.map((error) => error.path)).toEqual([
      'entry.logic',
      'entry.conditions[0].left.price',
      'entry.conditions[0].op',
      'indicators[0].id',
      'indicators[0].params.period',
      'risk.stop_loss.type',
      'risk.stop_loss.value',
      'risk.take_profit',
      'exit',
    ]);
  });
});
