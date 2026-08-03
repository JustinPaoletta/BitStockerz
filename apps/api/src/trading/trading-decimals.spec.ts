import { cashNotional, formatMoney, formatTrading } from './trading-decimals';

describe('trading decimal helpers', () => {
  it('rounds cash notional once with ROUND_HALF_UP', () => {
    expect(cashNotional('1.005', '1').toFixed(2)).toBe('1.01');
    expect(cashNotional('3', '0.335').toFixed(2)).toBe('1.01');
  });

  it('emits fixed money and trading scales', () => {
    expect(formatMoney('12')).toBe('12.00');
    expect(formatTrading('12.3')).toBe('12.30000000');
  });
});
