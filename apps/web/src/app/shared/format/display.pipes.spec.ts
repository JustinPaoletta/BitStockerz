import { BsCurrencyPipe, BsDateTimePipe, BsSignedPipe } from './display.pipes';

describe('display pipes', () => {
  const currency = new BsCurrencyPipe();
  const signed = new BsSignedPipe();
  const dateTime = new BsDateTimePipe();

  it('formats currency aggregates and ignores leading plus signs', () => {
    expect(currency.transform('100000.00')).toContain('100,000.00');
    expect(currency.transform('+12.50')).toContain('12.50');
    expect(currency.transform('nope')).toBe('—');
  });

  it('adds an explicit sign for positive P&L strings', () => {
    expect(signed.transform('12.50')).toBe('+12.50');
    expect(signed.transform('-3.00')).toBe('-3.00');
    expect(signed.transform('bad')).toBe('');
  });

  it('formats ISO timestamps for local display', () => {
    const formatted = dateTime.transform('2026-08-03T01:18:05.849Z');
    expect(formatted).not.toBe('—');
    expect(dateTime.transform('not-a-date')).toBe('—');
  });
});
