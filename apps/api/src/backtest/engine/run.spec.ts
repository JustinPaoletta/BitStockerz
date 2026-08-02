import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import type { BacktestEngineInput, EngineBar } from './backtest-engine.types';
import { BacktestEngine, runBacktest } from './run';

describe('BacktestEngine', () => {
  it('runs a price-only one-bar no-trade definition deterministically', () => {
    const input: BacktestEngineInput = {
      definition: priceDefinition(1_000, -1),
      bars: barsFromCloses([100]),
      initialEquity: 10_000,
    };

    const output = runBacktest(input, { now: () => 20 });

    expect(output).toEqual({
      trades: [],
      equityCurve: [
        { ts: new Date('2026-01-01T00:00:00.000Z'), equity: 10_000 },
      ],
      metrics: {
        finalEquity: 10_000,
        totalReturnPct: 0,
        maxDrawdownPct: 0,
        winRatePct: 0,
        numTrades: 0,
        avgWinPct: 0,
        avgLossPct: 0,
        sharpeRatio: null,
      },
      diagnostics: {
        barsProcessed: 1,
        durationMs: 0,
        indicatorsComputed: 0,
        signalsFired: 0,
      },
    });
    expect(BacktestEngine.run(input).metrics).toEqual(output.metrics);
  });

  it('fills at signal-bar close and force-closes at the final close', () => {
    const output = deterministicRun({
      definition: priceDefinition(0, -1),
      bars: barsFromCloses([100, 110, 120]),
      initialEquity: 1_000,
      symbolId: 42,
    });

    expect(output.trades).toHaveLength(1);
    expect(output.trades[0]).toMatchObject({
      entryTime: new Date('2026-01-01T00:00:00.000Z'),
      exitTime: new Date('2026-01-03T00:00:00.000Z'),
      side: 'long',
      entryPrice: 100,
      exitPrice: 120,
      quantity: 10,
      pnlAbs: 200,
      pnlPct: 20,
      symbolId: 42,
    });
    expect(output.metrics.finalEquity).toBe(1_200);
    expect(output.diagnostics.signalsFired).toBe(1);
  });

  it('checks risk from the bar after entry and applies stop-first priority', () => {
    const bars = barsFromCloses([100, 100]);
    bars[1] = { ...bars[1], low: 94, high: 111 };

    const output = deterministicRun({
      definition: priceDefinition(0, -1, 5, 10),
      bars,
      initialEquity: 1_000,
    });

    expect(output.trades).toHaveLength(1);
    expect(output.trades[0]).toMatchObject({
      entryPrice: 100,
      exitPrice: 95,
      pnlAbs: -50,
      pnlPct: -5,
    });
    expect(output.metrics.finalEquity).toBe(950);
    expect(output.diagnostics.signalsFired).toBe(1);
  });

  it('supports the approved 500% take-profit ceiling', () => {
    const bars = barsFromCloses([100, 100]);
    bars[1] = { ...bars[1], high: 600 };

    const output = deterministicRun({
      definition: priceDefinition(0, -1, 5, 500),
      bars,
      initialEquity: 1_000,
    });

    expect(output.trades[0]).toMatchObject({
      exitPrice: 600,
      pnlAbs: 5_000,
      pnlPct: 500,
    });
    expect(output.metrics.finalEquity).toBe(6_000);
  });

  it('prioritizes rule exits and prevents same-bar re-entry', () => {
    const output = deterministicRun({
      definition: priceDefinition(90, 95, 50, 500),
      bars: barsFromCloses([100, 94, 100]),
      initialEquity: 1_000,
    });

    expect(output.trades).toHaveLength(2);
    expect(output.trades[0]).toMatchObject({
      entryPrice: 100,
      exitPrice: 94,
    });
    expect(output.trades[1].entryTime).toEqual(
      new Date('2026-01-03T00:00:00.000Z'),
    );
    expect(output.diagnostics.signalsFired).toBe(3);
  });

  it('defensively runs a legacy definition with absent risk rules', () => {
    const definition = priceDefinition(0, -1) as StrategyDefinition & {
      risk?: StrategyDefinition['risk'];
    };
    delete definition.risk;

    const output = deterministicRun({
      definition,
      bars: barsFromCloses([100, 105]),
      initialEquity: 1_000,
    });

    expect(output.trades[0].exitPrice).toBe(105);
  });

  it('is deterministic apart from measured duration', () => {
    const input = {
      definition: smaCrossDefinition(),
      bars: barsFromCloses([10, 9, 8, 9, 10, 11, 10, 9, 8]),
      initialEquity: 1_000,
    };

    expect(deterministicRun(input)).toEqual(deterministicRun(input));
  });

  it('rejects invalid definitions, equity, limits, and bar containers', () => {
    expectCode(
      () =>
        deterministicRun({
          definition: {
            ...priceDefinition(0, -1),
            entry: { logic: 'OR' as 'AND', conditions: [] },
          },
          bars: barsFromCloses([100]),
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(0, -1),
          bars: barsFromCloses([100]),
          initialEquity: 0,
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(0, -1),
          bars: null as never,
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(0, -1),
          bars: barsFromCloses([100]),
          initialEquity: 1_000,
          limits: { timeoutMs: 0 },
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
  });

  it.each([
    [
      'duplicate timestamps',
      () => {
        const bars = barsFromCloses([100, 101]);
        bars[1].ts = new Date(bars[0].ts);
        return bars;
      },
    ],
    ['descending timestamps', () => barsFromCloses([100, 101]).reverse()],
    [
      'invalid timestamp',
      () => [
        {
          ...barsFromCloses([100])[0],
          ts: new Date(Number.NaN),
        },
      ],
    ],
    [
      'non-finite prices',
      () => [{ ...barsFromCloses([100])[0], close: Number.NaN }],
    ],
    ['non-positive prices', () => [{ ...barsFromCloses([100])[0], low: 0 }]],
    ['negative volume', () => [{ ...barsFromCloses([100])[0], volume: -1 }]],
    ['inconsistent OHLC', () => [{ ...barsFromCloses([100])[0], low: 101 }]],
    ['non-object bars', () => [null as never]],
  ])('rejects %s', (_name, createBars) => {
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(1_000, -1),
          bars: createBars(),
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );
  });

  it('distinguishes insufficient bars from bar and series limits', () => {
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(1_000, -1),
          bars: [],
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INSUFFICIENT_BARS,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: smaCrossDefinition(5, 10),
          bars: barsFromCloses([1, 2, 3, 4, 5]),
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INSUFFICIENT_BARS,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(1_000, -1),
          bars: barsFromCloses([1, 2]),
          initialEquity: 1_000,
          limits: { maxBars: 1 },
        }),
      ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
    );
    expectCode(
      () =>
        deterministicRun({
          definition: smaCrossDefinition(),
          bars: barsFromCloses([1, 2, 3, 4, 5]),
          initialEquity: 1_000,
          limits: { maxSeriesCells: 5 },
        }),
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    );
  });

  it('requires one extra bar for Wilder RSI seed changes', () => {
    const definition = smaCrossDefinition();
    definition.indicators = [
      {
        id: 'rsi',
        type: 'RSI',
        params: { period: 2 },
        source: 'close',
      },
    ];
    definition.entry.conditions = [
      {
        left: { indicator: 'rsi' },
        op: 'gt',
        right: { literal: 50 },
      },
    ];
    definition.exit.conditions = [
      {
        left: { indicator: 'rsi' },
        op: 'lt',
        right: { literal: 50 },
      },
    ];

    expectCode(
      () =>
        deterministicRun({
          definition,
          bars: barsFromCloses([1, 2]),
          initialEquity: 1_000,
        }),
      ErrorCode.BACKTEST_INSUFFICIENT_BARS,
    );
    expect(
      deterministicRun({
        definition,
        bars: barsFromCloses([1, 2, 3]),
        initialEquity: 1_000,
      }).diagnostics.barsProcessed,
    ).toBe(3);
  });

  it('honors pre-aborted signals and monotonic deadlines', () => {
    const controller = new AbortController();
    controller.abort();
    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(1_000, -1),
          bars: barsFromCloses([100]),
          initialEquity: 1_000,
          signal: controller.signal,
        }),
      ErrorCode.BACKTEST_TIMEOUT,
    );

    let call = 0;
    expectCode(
      () =>
        runBacktest(
          {
            definition: priceDefinition(1_000, -1),
            bars: barsFromCloses([100]),
            initialEquity: 1_000,
            limits: { timeoutMs: 1 },
          },
          { now: () => (call++ < 2 ? 0 : 2) },
        ),
      ErrorCode.BACKTEST_TIMEOUT,
    );
  });

  it('fails closed on numeric overflow', () => {
    const bars = barsFromCloses([Number.MAX_VALUE, Number.MAX_VALUE]);
    bars[0].open = Number.MAX_VALUE;
    bars[0].high = Number.MAX_VALUE;
    bars[0].low = Number.MAX_VALUE;
    bars[1] = { ...bars[0], ts: new Date('2026-01-02T00:00:00.000Z') };

    expectCode(
      () =>
        deterministicRun({
          definition: priceDefinition(0, -1, 5, 500),
          bars,
          initialEquity: Number.MAX_VALUE,
        }),
      ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED,
    );
  });
});

function deterministicRun(input: BacktestEngineInput) {
  return runBacktest(input, { now: () => 0 });
}

function priceDefinition(
  entryAbove: number,
  exitBelow: number,
  stopLoss = 50,
  takeProfit = 500,
): StrategyDefinition {
  return {
    indicators: [],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'gt',
          right: { literal: entryAbove },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'lt',
          right: { literal: exitBelow },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: stopLoss },
      take_profit: { type: 'percent', value: takeProfit },
    },
  };
}

function smaCrossDefinition(fast = 2, slow = 3): StrategyDefinition {
  return {
    indicators: [
      {
        id: 'fast',
        type: 'SMA',
        params: { period: fast },
        source: 'close',
      },
      {
        id: 'slow',
        type: 'SMA',
        params: { period: slow },
        source: 'close',
      },
    ],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'fast' },
          op: 'crosses_above',
          right: { indicator: 'slow' },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { indicator: 'fast' },
          op: 'crosses_below',
          right: { indicator: 'slow' },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 20 },
      take_profit: { type: 'percent', value: 100 },
    },
  };
}

function barsFromCloses(closes: readonly number[]): EngineBar[] {
  return closes.map((close, index) => {
    const open = index === 0 ? close : closes[index - 1];
    return {
      ts: new Date(Date.UTC(2026, 0, index + 1)),
      open,
      high: Math.max(open, close) + 1,
      low: Math.max(Number.MIN_VALUE, Math.min(open, close) - 1),
      close,
      volume: 1_000 + index,
    };
  });
}

function expectCode(action: () => unknown, code: ErrorCode): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code });
  }
}
