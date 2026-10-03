import { computeConfidence } from './ai-confidence';

describe('computeConfidence', () => {
  it('returns LOW for suggestions without backtest context', () => {
    expect(
      computeConfidence({
        mode: 'suggest',
        hasBacktestContext: false,
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      }),
    ).toBe('LOW');
  });

  it('returns HIGH when any deterministic finding is HIGH', () => {
    expect(
      computeConfidence({
        mode: 'validate',
        deterministicSeverities: ['MEDIUM', 'HIGH'],
        modelOnlyFindingCount: 0,
      }),
    ).toBe('HIGH');
  });

  it('returns MEDIUM for other deterministic findings', () => {
    expect(
      computeConfidence({
        mode: 'validate',
        deterministicSeverities: ['LOW'],
        modelOnlyFindingCount: 2,
      }),
    ).toBe('MEDIUM');
  });

  it('returns LOW for model-only findings', () => {
    expect(
      computeConfidence({
        mode: 'validate',
        deterministicSeverities: [],
        modelOnlyFindingCount: 1,
      }),
    ).toBe('LOW');
  });

  it('returns MEDIUM for clean explain/validate', () => {
    expect(
      computeConfidence({
        mode: 'explain',
        deterministicSeverities: [],
        modelOnlyFindingCount: 0,
      }),
    ).toBe('MEDIUM');
  });
});
