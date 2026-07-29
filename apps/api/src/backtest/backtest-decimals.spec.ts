import { ErrorCode } from '../common/errors/error-codes.enum';
import { toPersistedDecimal } from './backtest-decimals';

describe('toPersistedDecimal', () => {
  it('rounds half-up and emits a fixed-scale decimal string', () => {
    expect(toPersistedDecimal(12.345, 6, 2, 'value')).toBe('12.35');
    expect(toPersistedDecimal(-12.344, 6, 2, 'value')).toBe('-12.34');
  });

  it.each([
    ['non-finite', Number.POSITIVE_INFINITY, 6, 2, {}],
    ['positive zero', 0, 6, 2, { positive: true }],
    ['positive rounds to zero', 0.004, 6, 2, { positive: true }],
    ['negative', -0.01, 6, 2, { nonNegative: true }],
    ['positive overflow', 10_000, 6, 2, {}],
    ['negative overflow', -10_000, 6, 2, {}],
  ])(
    'rejects %s values that the target decimal cannot represent',
    (_name, value, precision, scale, options) => {
      expect(() =>
        toPersistedDecimal(value, precision, scale, 'value', options),
      ).toThrow(
        expect.objectContaining({
          code: ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
        }),
      );
    },
  );
});
