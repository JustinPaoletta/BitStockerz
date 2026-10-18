import { classifyPriceSource, classifyRunPriceSource } from './price-source';

describe('classifyPriceSource', () => {
  it('keeps database-stored seed bars labeled as demo data', () => {
    expect(
      classifyPriceSource([{ provider: 'seed' }, { provider: 'seed' }]),
    ).toBe('seed');
    expect(classifyPriceSource([{ provider: 'Alpaca' }])).toBe('alpaca');
  });

  it('does not claim a single provider for mixed or incomplete bars', () => {
    expect(
      classifyPriceSource([{ provider: 'seed' }, { provider: 'alpaca' }]),
    ).toBe('mixed');
    expect(classifyPriceSource([{ provider: 'seed' }, {}])).toBe('unknown');
    expect(classifyPriceSource([])).toBe('unknown');
  });

  it('preserves a simulated-price warning for mixed or incomplete backtest data', () => {
    expect(
      classifyRunPriceSource([{ provider: 'seed' }, { provider: 'alpaca' }]),
    ).toBe('mixed_with_seed');
    expect(classifyRunPriceSource([{ provider: 'seed' }, {}])).toBe(
      'unknown_with_seed',
    );
  });
});
