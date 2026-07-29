import { Test } from '@nestjs/testing';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { AppConfigService } from '../../config/app-config.service';
import type { StrategyDefinition } from '../../strategies/definition/strategy-definition.types';
import { BacktestModule } from '../backtest.module';
import { BacktestEngineService } from './backtest-engine.service';
import type { BacktestEngineInput, EngineBar } from './backtest-engine.types';

describe('BacktestEngineService', () => {
  const config = {
    server: { nodeEnv: 'test' },
    dependencies: { databaseUrl: undefined },
    backtest: {
      timeoutMs: 5_000,
      maxBars: 2,
      maxSeriesCells: 10,
    },
  } as AppConfigService;

  it('uses configured limits and caps caller attempts to raise them', () => {
    const service = new BacktestEngineService(config);
    expectCode(
      () => service.run(input([100, 101, 102])),
      ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
    );
    expectCode(
      () =>
        service.run({
          ...input([100, 101, 102]),
          limits: { maxBars: 100 },
        }),
      ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
    );
  });

  it('allows callers to request stricter limits', () => {
    const service = new BacktestEngineService(config);
    expectCode(
      () =>
        service.run({
          ...input([100, 101]),
          limits: { maxBars: 1 },
        }),
      ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED,
    );
  });

  it('rejects malformed caller limits and honors caller cancellation', () => {
    const service = new BacktestEngineService(config);
    expectCode(
      () =>
        service.run({
          ...input([100]),
          limits: { maxBars: 0 },
        }),
      ErrorCode.BACKTEST_INVALID_DEFINITION,
    );

    const controller = new AbortController();
    controller.abort();
    expectCode(
      () => service.run({ ...input([100]), signal: controller.signal }),
      ErrorCode.BACKTEST_TIMEOUT,
    );
  });

  it('is exported by the Nest backtest module', async () => {
    const module = await Test.createTestingModule({
      imports: [BacktestModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(config)
      .compile();

    expect(module.get(BacktestEngineService)).toBeInstanceOf(
      BacktestEngineService,
    );
    await module.close();
  });
});

function input(closes: readonly number[]): BacktestEngineInput {
  return {
    definition: definition(),
    bars: closes.map(bar),
    initialEquity: 1_000,
  };
}

function definition(): StrategyDefinition {
  return {
    indicators: [],
    entry: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'gt',
          right: { literal: 1_000 },
        },
      ],
    },
    exit: {
      logic: 'AND',
      conditions: [
        {
          left: { price: 'close' },
          op: 'lt',
          right: { literal: 0 },
        },
      ],
    },
    risk: {
      stop_loss: { type: 'percent', value: 5 },
      take_profit: { type: 'percent', value: 500 },
    },
  };
}

function bar(close: number, index: number): EngineBar {
  return {
    ts: new Date(Date.UTC(2026, 0, index + 1)),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1_000,
  };
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
