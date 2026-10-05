import type {
  BenchmarkResult,
  EngineBar,
  SimulationSettings,
} from './backtest-engine.types';

/** Buy on the first close (or second open for next-open runs), hold to last close. */
export function calculateBenchmark(
  bars: readonly EngineBar[],
  initial: number,
  settings: SimulationSettings,
): BenchmarkResult {
  const entryIndex = settings.execution_timing === 'next_open' ? 1 : 0;
  const first = bars[entryIndex];
  if (!first)
    return {
      final_equity: initial.toFixed(2),
      total_return_pct: '0.0000',
      max_drawdown_pct: '0.0000',
      equity_curve: bars.map((bar) => ({
        timestamp: bar.ts.toISOString(),
        equity: initial.toFixed(2),
      })),
    };
  const commission = settings.commission_bps / 10000;
  const entry =
    (settings.execution_timing === 'next_open' ? first.open : first.close) *
    (1 + settings.slippage_bps / 10000);
  const invested = (initial * settings.allocation_pct) / 100;
  const quantity = invested / (entry * (1 + commission));
  const cash = initial - invested;
  let peak = initial;
  let drawdown = 0;
  let final = initial;
  const equity_curve = bars.map((bar, index) => {
    let equity = index < entryIndex ? initial : cash + quantity * bar.close;
    if (index === bars.length - 1)
      equity =
        cash +
        quantity *
          bar.close *
          (1 - settings.slippage_bps / 10000) *
          (1 - commission);
    final = equity;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, ((peak - equity) / peak) * 100);
    return { timestamp: bar.ts.toISOString(), equity: equity.toFixed(2) };
  });
  return {
    final_equity: final.toFixed(2),
    total_return_pct: ((final / initial - 1) * 100).toFixed(4),
    max_drawdown_pct: drawdown.toFixed(4),
    equity_curve,
  };
}
