import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { BacktestEngineService } from '../src/backtest/engine/backtest-engine.service';
import { BacktestsService } from '../src/backtest/backtests.service';
import { DomainError } from '../src/common/errors/domain-error';
import { ErrorCode } from '../src/common/errors/error-codes.enum';
import { PrismaService } from '../src/prisma/prisma.service';
import type { StrategyDefinition } from '../src/strategies/definition/strategy-definition.types';
import { StrategiesService } from '../src/strategies/strategies.service';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required for the MySQL persistence smoke.',
    );
  }

  let app: INestApplicationContext | undefined;
  let userId: string | undefined;
  let restartedUserId: string | undefined;
  let strategyId: string | undefined;
  let symbolId: number | undefined;
  let userEmail: string | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const auth = app.get(AuthService);
    const strategies = app.get(StrategiesService);
    const backtests = app.get(BacktestsService);
    const engine = app.get(BacktestEngineService);
    const prisma = app.get(PrismaService);
    assert.equal(
      prisma.isEnabled,
      true,
      'Prisma must be enabled in this smoke',
    );

    const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    userEmail = `backtest-smoke-${suffix}@example.com`;
    const registration = await auth.register(
      userEmail,
      'Backtest Persistence Smoke',
    );
    userId = registration.user.id;

    const symbol = await prisma.symbol.create({
      data: {
        symbol: `SMK-${crypto.randomUUID().slice(0, 12)}`.toUpperCase(),
        name: 'Backtest Persistence Smoke Symbol',
        assetType: 'EQUITY',
        exchange: 'TEST',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    symbolId = symbol.id;

    const strategy = await strategies.create(userId, {
      name: `Backtest Smoke ${suffix}`,
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: definition(),
    });
    strategyId = strategy.id;

    const run = await backtests.createRun({
      userId,
      strategyId,
      symbolId,
      timeframe: '1d',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-02T00:00:00.000Z'),
      initialEquity: 1_000,
    });
    assert.equal(run.status, 'pending');
    assert.ok(run.strategyVersionId > 0);

    await backtests.markRunning(run.id, userId);
    const output = engine.run({
      definition: definition(),
      bars: [
        {
          ts: new Date('2026-01-01T00:00:00.000Z'),
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          volume: 1_000,
        },
        {
          ts: new Date('2026-01-02T00:00:00.000Z'),
          open: 100,
          high: 110,
          low: 100,
          close: 110,
          volume: 1_000,
        },
      ],
      initialEquity: 1_000,
      symbolId,
    });
    await backtests.completeRun(run.id, userId, output);

    const detail = await backtests.getRun(run.id, userId);
    assert.ok(detail);
    assert.equal(detail.run.status, 'completed');
    assert.equal(detail.run.initialEquity, '1000.00');
    assert.equal(detail.result?.finalEquity, '1100.00');
    assert.equal(detail.result?.numTrades, 1);
    assert.equal(detail.trades.length, 1);
    assert.equal(detail.trades[0].symbolId, symbolId);
    assert.equal(detail.equityCurve.length, 2);
    assert.equal(detail.equityCurve[1].equity, '1100.00');

    const rowCounts = await Promise.all([
      prisma.backtestRun.count({ where: { id: run.id } }),
      prisma.backtestResult.count({ where: { backtestRunId: run.id } }),
      prisma.backtestTrade.count({ where: { backtestRunId: run.id } }),
      prisma.backtestEquityPoint.count({ where: { backtestRunId: run.id } }),
    ]);
    assert.deepEqual(rowCounts, [1, 1, 1, 2]);

    await assert.rejects(
      () => backtests.completeRun(run.id, userId as string, output),
      (error: unknown) =>
        error instanceof DomainError &&
        error.code === ErrorCode.BACKTEST_INVALID_STATE,
    );

    await app.close();
    app = undefined;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const restartedAuth = app.get(AuthService);
    const restartedBacktests = app.get(BacktestsService);
    const restartedAuthResponse = await restartedAuth.login(userEmail);
    restartedUserId = restartedAuthResponse.user.id;
    assert.equal(restartedUserId, userId);
    const restartedRuns = await restartedBacktests.listRuns(restartedUserId, {
      strategyId,
    });
    assert.equal(restartedRuns.length, 1);
    assert.equal(restartedRuns[0].run.id, run.id);
    assert.equal(restartedRuns[0].run.userId, restartedUserId);
    assert.equal(
      (await restartedBacktests.getRun(run.id, restartedUserId))?.run.status,
      'completed',
    );

    process.stdout.write(
      'Backtest MySQL persistence smoke PASS: round-trip, terminal immutability, and post-restart auth hydration verified.\n',
    );
  } finally {
    if (app) {
      const prisma = app.get(PrismaService);
      if (prisma.isEnabled) {
        const userIds = [userId, restartedUserId].filter(
          (id): id is string => id !== undefined,
        );
        await prisma.$transaction(async (transaction) => {
          if (userIds.length > 0) {
            await transaction.auditEvent.deleteMany({
              where: { userId: { in: userIds } },
            });
            await transaction.backtestRun.deleteMany({
              where: { userId: { in: userIds } },
            });
          }
          if (strategyId) {
            await transaction.strategyVersion.deleteMany({
              where: { strategyId },
            });
            await transaction.strategy.deleteMany({
              where: { id: strategyId },
            });
          }
          if (symbolId) {
            await transaction.symbol.deleteMany({ where: { id: symbolId } });
          }
          if (userIds.length > 0) {
            await transaction.user.deleteMany({
              where: { id: { in: userIds } },
            });
          }
        });
      }
      await app.close();
    }
  }
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
          right: { literal: 0 },
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
      stop_loss: { type: 'percent', value: 50 },
      take_profit: { type: 'percent', value: 500 },
    },
  };
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Backtest MySQL persistence smoke FAIL: ${
      error instanceof Error ? error.stack : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
