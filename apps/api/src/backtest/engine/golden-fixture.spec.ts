import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import type { EngineBar } from './backtest-engine.types';
import { runBacktest } from './run';

describe('backtest golden fixture', () => {
  it('locks SMA-cross trades, metrics, diagnostics, and curve alignment', () => {
    const definition = fixture<StrategyDefinition>('sma-cross.definition.json');
    const rawBars = fixture<Array<Omit<EngineBar, 'ts'> & { ts: string }>>(
      'sma-cross.bars.json',
    );
    const bars: EngineBar[] = rawBars.map((bar) => ({
      ...bar,
      ts: new Date(bar.ts),
    }));
    const expected = fixture<Record<string, unknown>>(
      'sma-cross.expected.json',
    );

    const output = runBacktest(
      {
        definition,
        bars,
        initialEquity: 10_000,
        symbolId: 1,
      },
      { now: () => 0 },
    );

    expect(output.equityCurve).toHaveLength(bars.length);
    expect(output.equityCurve.map((point) => point.ts)).toEqual(
      bars.map((bar) => bar.ts),
    );
    expect(
      JSON.parse(
        JSON.stringify({
          trades: output.trades,
          metrics: output.metrics,
          diagnostics: output.diagnostics,
        }),
      ),
    ).toEqual(expected);
  });

  it('runs a one-year daily fixture well under the two-second NFR', () => {
    const definition = fixture<StrategyDefinition>('sma-cross.definition.json');
    const bars = Array.from({ length: 365 }, (_, index) => {
      const close = 100 + Math.sin(index / 10) * 5;
      return {
        ts: new Date(Date.UTC(2025, 0, index + 1)),
        open: close,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000,
      };
    });

    const startedAt = performance.now();
    const output = runBacktest({ definition, bars, initialEquity: 10_000 });
    const elapsedMs = performance.now() - startedAt;

    expect(output.diagnostics.barsProcessed).toBe(365);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});

function fixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(join(__dirname, 'fixtures', name), 'utf8'),
  ) as T;
}
