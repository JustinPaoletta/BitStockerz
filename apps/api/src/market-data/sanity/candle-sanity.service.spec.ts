import { CandleSanityService } from './candle-sanity.service';
import type { SanityBarInput } from './candle-sanity.types';

function validBar(overrides: Partial<SanityBarInput> = {}): SanityBarInput {
  return {
    symbol: 'AAPL',
    interval: '1d',
    date: '2026-01-05',
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1_000,
    ...overrides,
  };
}

describe('CandleSanityService', () => {
  const service = new CandleSanityService();

  it('accepts a valid bar', () => {
    expect(service.validateBar(validBar())).toEqual([]);
  });

  it('flags high < low', () => {
    const issues = service.validateBar(validBar({ high: 80, low: 90 }));
    expect(issues.map((issue) => issue.code)).toContain('HIGH_LT_LOW');
  });

  it('flags high below body', () => {
    const issues = service.validateBar(
      validBar({ open: 100, close: 110, high: 105, low: 95 }),
    );
    expect(issues.map((issue) => issue.code)).toContain('HIGH_LT_BODY');
  });

  it('flags low above body', () => {
    const issues = service.validateBar(
      validBar({ open: 100, close: 110, high: 120, low: 105 }),
    );
    expect(issues.map((issue) => issue.code)).toContain('LOW_GT_BODY');
  });

  it('flags non-positive prices', () => {
    const issues = service.validateBar(validBar({ open: 0 }));
    expect(issues.map((issue) => issue.code)).toContain('NON_POSITIVE_PRICE');
  });

  it('flags negative volume', () => {
    const issues = service.validateBar(validBar({ volume: -1 }));
    expect(issues.map((issue) => issue.code)).toContain('NEGATIVE_VOLUME');
  });

  it('flags non-finite values and stops further checks', () => {
    const issues = service.validateBar(validBar({ high: Number.NaN }));
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('NON_FINITE');
  });

  it('flags non-finite volume', () => {
    const issues = service.validateBar(
      validBar({ volume: Number.POSITIVE_INFINITY }),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('NON_FINITE');
  });

  it('aggregates batch issues and caps reported issues', () => {
    const bars = Array.from({ length: 60 }, (_, index) =>
      validBar({
        symbol: `S${index}`,
        high: 50,
        low: 60,
      }),
    );

    const summary = service.scan(bars, 10);
    expect(summary.checked).toBe(60);
    expect(summary.invalid).toBe(60);
    expect(summary.issues.length).toBe(10);
  });
});
