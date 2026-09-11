import { identifyFailureModes, mergeIssues } from './failure-mode.heuristics';

describe('identifyFailureModes', () => {
  it('emits the documented heuristic codes', () => {
    const issues = identifyFailureModes({
      barsProcessed: 20,
      result: {
        finalEquity: '8000.00',
        totalReturnPct: '-20.0000',
        maxDrawdownPct: '30.0000',
        winRatePct: '20.0000',
        numTrades: 2,
        avgWinPct: '10.0000',
        avgLossPct: '-5.0000',
        sharpeRatio: null,
      },
      trades: [
        {
          symbolId: 1,
          entryTime: new Date('2024-01-01T00:00:00.000Z'),
          exitTime: new Date('2024-01-02T00:00:00.000Z'),
          side: 'long',
          entryPrice: '100',
          exitPrice: '110',
          quantity: '1',
          pnlAbs: '90.00',
          pnlPct: '10.00',
        },
        {
          symbolId: 1,
          entryTime: new Date('2024-01-03T00:00:00.000Z'),
          exitTime: new Date('2024-01-04T00:00:00.000Z'),
          side: 'long',
          entryPrice: '100',
          exitPrice: '101',
          quantity: '1',
          pnlAbs: '10.00',
          pnlPct: '1.00',
        },
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'SHORT_SAMPLE',
        'TOO_FEW_TRADES',
        'HIGH_DRAWDOWN',
        'NEGATIVE_RETURN',
        'CONCENTRATED_PNL',
      ]),
    );
  });
});

describe('mergeIssues', () => {
  it('dedupes by code and demotes model-only HIGH', () => {
    const merged = mergeIssues(
      [
        {
          code: 'TOO_FEW_TRADES',
          severity: 'HIGH',
          message: 'deterministic',
          evidence: ['num_trades=1'],
        },
      ],
      [
        {
          code: 'TOO_FEW_TRADES',
          severity: 'LOW',
          message: 'ignored',
          evidence: [],
        },
        {
          code: 'MODEL_ISSUE',
          severity: 'HIGH',
          message: 'model',
          evidence: ['x'],
        },
      ],
    );

    expect(merged).toEqual([
      expect.objectContaining({ code: 'TOO_FEW_TRADES', severity: 'HIGH' }),
      expect.objectContaining({ code: 'MODEL_ISSUE', severity: 'MEDIUM' }),
    ]);
  });
});
