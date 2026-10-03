import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { fitContextBudget } from './context-budget';
import { StrategyIntelligenceService } from './strategy-intelligence.service';
import { BacktestIntelligenceService } from './backtest-intelligence.service';
import type { AiService } from './ai.service';
import type { AppConfigService } from '../config/app-config.service';
import type { StrategiesService } from '../strategies/strategies.service';
import type { BacktestsService } from '../backtest/backtests.service';
import type { JobsService } from '../jobs/jobs.service';
import type { MarketDataService } from '../market-data/market-data.service';

const definition = {
  indicators: [
    { id: 'sma', type: 'SMA', params: { period: 20 }, source: 'close' },
  ],
  entry: {
    logic: 'AND' as const,
    conditions: [
      { left: { indicator: 'sma' }, op: 'gt' as const, right: { literal: 1 } },
    ],
  },
  exit: {
    logic: 'AND' as const,
    conditions: [
      { left: { indicator: 'sma' }, op: 'lt' as const, right: { literal: 1 } },
    ],
  },
  risk: {
    stop_loss: { type: 'percent' as const, value: 2 },
    take_profit: { type: 'percent' as const, value: 4 },
  },
};

describe('fitContextBudget', () => {
  it('omits lower-priority fields before rejecting', () => {
    const result = fitContextBudget({ keep: 'x', drop: 'y'.repeat(50) }, 40, [
      'drop',
    ]);
    expect(result.context_truncated).toBe(true);
    expect(result.payload).toMatchObject({
      keep: 'x',
      context_truncated: true,
    });
  });

  it('throws when still over budget', () => {
    expect(() => fitContextBudget({ keep: 'x'.repeat(100) }, 10, [])).toThrow(
      DomainError,
    );
  });
});

describe('StrategyIntelligenceService', () => {
  it('explains and validates through AiService', async () => {
    const strategies = {
      getById: jest.fn().mockResolvedValue({
        id: 's1',
        name: 'Alpha',
        description: 'desc',
        asset_type: 'EQUITY',
        timeframe: '1d',
        version_number: 1,
        definition,
        summary: 'summary',
      }),
    };
    const ai = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          disclaimer:
            'Not financial advice. Kernel suggestions are informational only.',
          confidence: 'MEDIUM',
          ai_request_id: 'req-1',
          explanation: 'Hello',
          warnings: [],
        })
        .mockResolvedValueOnce({
          disclaimer:
            'Not financial advice. Kernel suggestions are informational only.',
          confidence: 'LOW',
          ai_request_id: 'req-2',
          warnings: [
            {
              code: 'MODEL_ONLY',
              severity: 'HIGH',
              message: 'model warning',
              evidence_paths: ['entry'],
            },
          ],
        }),
    };
    const config = { ai: { maxContextChars: 12000 } };
    const service = new StrategyIntelligenceService(
      strategies as unknown as StrategiesService,
      ai as unknown as AiService,
      config as unknown as AppConfigService,
    );

    await expect(service.explainStrategy('u1', 's1')).resolves.toMatchObject({
      explanation: 'Hello',
      confidence: 'MEDIUM',
    });
    await expect(service.validateStrategy('u1', 's1')).resolves.toMatchObject({
      warnings: [
        expect.objectContaining({ code: 'MODEL_ONLY', severity: 'MEDIUM' }),
      ],
      confidence: 'LOW',
    });
  });
});

describe('BacktestIntelligenceService', () => {
  const run = {
    id: 'b1',
    userId: 'u1',
    strategyId: 's1',
    strategyVersionId: 1,
    symbolId: 1,
    timeframe: '1d' as const,
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2024-01-10T00:00:00.000Z'),
    initialEquity: '10000.00',
    status: 'completed' as const,
    jobId: 'job-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = {
    finalEquity: '11000.00',
    totalReturnPct: '10.0000',
    maxDrawdownPct: '5.0000',
    winRatePct: '50.0000',
    numTrades: 10,
    avgWinPct: '2.0000',
    avgLossPct: '-1.0000',
    sharpeRatio: '1.0000',
  };

  it('explains completed runs and suggests improvements', async () => {
    const backtests = {
      getRun: jest.fn().mockResolvedValue({
        run,
        result,
        trades: [
          {
            symbolId: 1,
            entryTime: new Date('2024-01-02T00:00:00.000Z'),
            exitTime: new Date('2024-01-03T00:00:00.000Z'),
            side: 'long',
            entryPrice: '100',
            exitPrice: '110',
            quantity: '1',
            pnlAbs: '10',
            pnlPct: '10',
          },
        ],
        equityCurve: [],
      }),
    };
    const strategies = {
      getById: jest.fn().mockResolvedValue({
        id: 's1',
        name: 'Alpha',
        definition,
        summary: 'summary',
      }),
    };
    const jobs = {
      getJobForUser: jest.fn().mockRejectedValue(new Error('missing')),
    };
    const marketData = {
      getSymbolsByIds: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }]),
    };
    const ai = {
      invoke: jest
        .fn()
        .mockResolvedValueOnce({
          disclaimer: 'd',
          confidence: 'MEDIUM',
          ai_request_id: 'r1',
          explanation: 'explained',
          issues: [
            {
              code: 'MODEL_ISSUE',
              severity: 'HIGH',
              message: 'model',
              evidence: ['x'],
            },
          ],
        })
        .mockResolvedValueOnce({
          disclaimer: 'd',
          confidence: 'MEDIUM',
          ai_request_id: 'r2',
          suggestions: [
            {
              code: 'REVIEW_STOP_DISTANCE',
              title: 'Review stop',
              description: 'Widen stop',
              evidence: [],
            },
            {
              code: 'REVIEW_STOP_DISTANCE',
              title: 'Dup',
              description: 'ignored',
              evidence: [],
            },
          ],
        })
        .mockResolvedValueOnce({
          disclaimer: 'd',
          confidence: 'LOW',
          ai_request_id: 'r3',
          suggestions: [
            {
              code: 'REVIEW_RISK_PARAMETERS',
              title: 'Review risk',
              description: 'Check risk',
              evidence: ['stub'],
            },
          ],
        }),
    };
    const service = new BacktestIntelligenceService(
      backtests as unknown as BacktestsService,
      strategies as unknown as StrategiesService,
      jobs as unknown as JobsService,
      marketData as unknown as MarketDataService,
      ai as unknown as AiService,
      { ai: { maxContextChars: 12000 } } as unknown as AppConfigService,
    );

    await expect(service.explainBacktest('u1', 'b1')).resolves.toMatchObject({
      explanation: 'explained',
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'MODEL_ISSUE', severity: 'MEDIUM' }),
      ]),
    });
    await expect(
      service.suggestImprovements('u1', 's1', 'b1'),
    ).resolves.toMatchObject({
      suggestions: [expect.objectContaining({ code: 'REVIEW_STOP_DISTANCE' })],
      confidence: 'MEDIUM',
    });
    await expect(
      service.suggestImprovements('u1', 's1'),
    ).resolves.toMatchObject({
      confidence: 'LOW',
    });
  });

  it('rejects non-completed runs and mismatched strategy ids', async () => {
    const backtests = {
      getRun: jest
        .fn()
        .mockResolvedValueOnce({
          run: { ...run, status: 'running' },
          result: null,
          trades: [],
          equityCurve: [],
        })
        .mockResolvedValueOnce({
          run: { ...run, strategyId: 'other' },
          result,
          trades: [],
          equityCurve: [],
        })
        .mockResolvedValueOnce(null),
    };
    const service = new BacktestIntelligenceService(
      backtests as unknown as BacktestsService,
      {
        getById: jest.fn().mockResolvedValue({
          id: 's1',
          name: 'Alpha',
          definition,
          summary: 'summary',
        }),
      } as unknown as StrategiesService,
      { getJobForUser: jest.fn() } as unknown as JobsService,
      {
        getSymbolsByIds: jest.fn().mockResolvedValue([{ symbol: 'AAPL' }]),
      } as unknown as MarketDataService,
      { invoke: jest.fn() } as unknown as AiService,
      { ai: { maxContextChars: 12000 } } as unknown as AppConfigService,
    );

    await expect(service.explainBacktest('u1', 'b1')).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_INVALID_STATE,
    });
    await expect(
      service.suggestImprovements('u1', 's1', 'b1'),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(
      service.explainBacktest('u1', 'missing'),
    ).rejects.toMatchObject({
      code: ErrorCode.BACKTEST_NOT_FOUND,
    });
  });
});
