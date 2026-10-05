import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { AutomationService } from '../src/automation/automation.service';
import { BacktestsService } from '../src/backtest/backtests.service';
import { runBacktest } from '../src/backtest/engine/run';
import { PrismaService } from '../src/prisma/prisma.service';
import { ProductService } from '../src/product/product.service';
import type { StrategyDefinition } from '../src/strategies/definition/strategy-definition.types';
import { StrategiesService } from '../src/strategies/strategies.service';
import { OrdersService } from '../src/trading/orders.service';

// Use a disposable migrated MySQL database. Only unique fixture users/symbols are removed.
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  Object.assign(process.env, {
    NODE_ENV: 'development',
    INGESTION_SCHEDULER_ENABLED: 'false',
    AUTH_DEV_EMAIL_ENABLED: 'true',
    LOG_LEVEL: 'silent',
  });
  let app: INestApplicationContext | undefined;
  const users: { id: string; email: string }[] = [];
  let symbolId: number | undefined;
  const start = () =>
    NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    app = await start();
    let auth = app.get(AuthService);
    let prisma = app.get(PrismaService);
    assert.equal(prisma.isEnabled, true);
    const suffix = randomUUID();
    const owner = await auth.register(`workspace-${suffix}@example.com`);
    users.push(owner.user);
    const other = await auth.register(`workspace-other-${suffix}@example.com`);
    users.push(other.user);
    const now = new Date();
    const symbol = await prisma.symbol.create({
      data: {
        symbol: `WS-${suffix.slice(0, 8)}`.toUpperCase(),
        name: 'Disposable workspace fixture',
        assetType: 'EQUITY',
        currency: 'USD',
        exchange: 'TEST',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    });
    symbolId = symbol.id;
    const day = new Date(
      Math.floor(Date.now() / 86400000) * 86400000 - 86400000,
    );
    const bars = [2, 1, 0].map((offset, index) => ({
      ts: new Date(day.getTime() - offset * 86400000),
      open: 100 + index,
      high: 100 + index,
      low: 100 + index,
      close: 100 + index,
      volume: 100,
    }));
    await prisma.equityDailyBar.createMany({
      data: bars.map((bar) => ({
        symbolId: symbol.id,
        date: bar.ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: 100n,
        provider: 'workspace-test',
        createdAt: now,
      })),
    });
    const definition: StrategyDefinition = {
      indicators: [
        { id: 'sma', type: 'SMA', params: { period: 2 }, source: 'close' },
      ],
      entry: {
        logic: 'AND',
        conditions: [
          { left: { price: 'close' }, op: 'gt', right: { literal: 0 } },
        ],
      },
      exit: {
        logic: 'AND',
        conditions: [
          { left: { price: 'close' }, op: 'lt', right: { literal: 0 } },
        ],
      },
      risk: {
        stop_loss: { type: 'percent', value: 2 },
        take_profit: { type: 'percent', value: 5 },
      },
    };
    const strategy = await app.get(StrategiesService).create(owner.user.id, {
      name: 'Workspace fixture',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition,
    });
    let product = app.get(ProductService);
    await product.saveWatchlistSymbol(owner.user.id, symbol.symbol);
    const runner = await app.get(AutomationService).create(owner.user.id, {
      strategy_id: strategy.id,
      symbol: symbol.symbol,
      allocation_pct: 10,
    });
    await app
      .get(AutomationService)
      .control(owner.user.id, runner.id, 'active');
    await app.get(AutomationService).evaluate(owner.user.id, runner.id);
    assert.equal(
      await prisma.order.count({
        where: { account: { userId: owner.user.id } },
      }),
      1,
    );
    const simulation = {
      allocation_pct: 35,
      commission_bps: 10,
      slippage_bps: 20,
      execution_timing: 'next_open' as const,
      evaluation_period: 'out_of_sample' as const,
    };
    const backtests = app.get(BacktestsService);
    const run = await backtests.createRun({
      userId: owner.user.id,
      strategyId: strategy.id,
      symbolId: symbol.id,
      timeframe: '1d',
      startDate: bars[0].ts,
      endDate: day,
      initialEquity: 10000,
      simulation,
    });
    await backtests.markRunning(run.id, owner.user.id);
    await backtests.completeRun(
      run.id,
      owner.user.id,
      runBacktest(
        {
          definition,
          bars,
          initialEquity: 10000,
          simulation,
          symbolId: symbol.id,
        },
        { now: () => 0 },
      ),
    );
    const ceremony = await auth.createAdditionalPasskeyOptions(
      owner.access_token,
    );
    await app.close();
    app = await start();
    auth = app.get(AuthService);
    prisma = app.get(PrismaService);
    product = app.get(ProductService);
    assert.equal(
      auth.requireUserBySessionToken(owner.access_token).id,
      owner.user.id,
    );
    assert.equal(
      (await product.watchlist(owner.user.id)).symbols[0].symbol,
      symbol.symbol,
    );
    const restored = await app
      .get(BacktestsService)
      .getRun(run.id, owner.user.id);
    assert.equal(restored?.run.simulation?.execution_timing, 'next_open');
    assert.ok(restored?.result?.benchmark);
    assert.ok(Number(restored?.trades[0].feesAbs) > 0);
    assert.equal(
      await app.get(BacktestsService).getRun(run.id, other.user.id),
      null,
    );
    const persistedChallenge = await prisma.webAuthnChallenge.findUnique({
      where: { id: ceremony.challenge_id },
    });
    assert.equal(persistedChallenge?.purpose, 'enroll');
    assert.equal(persistedChallenge?.userId, owner.user.id);
    await assert.rejects(
      app.get(AutomationService).control(other.user.id, runner.id, 'paused'),
    );
    await app.get(AutomationService).evaluate(owner.user.id, runner.id);
    assert.equal(
      await prisma.order.count({
        where: { account: { userId: owner.user.id } },
      }),
      1,
      'Restart must not duplicate a fill.',
    );
    const data = await product.exportUser(owner.access_token);
    assert.ok(!JSON.stringify(data).includes(owner.access_token));
    await product.resetAccount(owner.access_token);
    const archive = await product.accountArchives(owner.user.id);
    assert.equal(archive.archives.length, 1);
    assert.equal(
      (await app.get(AutomationService).list(owner.user.id))[0].status,
      'stopped',
    );
    const oldOrder = (
      archive.archives[0].snapshot as { orders: { clientOrderId: string }[] }
    ).orders[0];
    await assert.rejects(
      app.get(OrdersService).placeMarketOrder(owner.user.id, {
        symbol: symbol.symbol,
        side: 'BUY',
        quantity: '1',
        clientOrderId: oldOrder.clientOrderId,
      }),
    );
    await product.deleteUser(owner.access_token, owner.user.email);
    assert.equal(
      await prisma.user.findUnique({ where: { id: owner.user.id } }),
      null,
    );
    assert.equal(
      await prisma.paperAccountArchive.count({
        where: { userId: owner.user.id },
      }),
      0,
    );
    assert.equal(
      await prisma.paperAutomation.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(
      await prisma.watchlistEntry.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(
      await prisma.backtestRun.count({ where: { userId: owner.user.id } }),
      0,
    );
    assert.equal(
      auth.requireUserBySessionToken(other.access_token).id,
      other.user.id,
    );
    await app.close();
    app = await start();
    auth = app.get(AuthService);
    assert.throws(() => auth.requireUserBySessionToken(owner.access_token));
    assert.equal(
      auth.requireUserBySessionToken(other.access_token).id,
      other.user.id,
    );
    console.log(
      'MySQL workspace restart, cost persistence, idempotency, reset, export and deletion checks passed.',
    );
  } finally {
    if (app) {
      const auth = app.get(AuthService);
      for (const user of users) {
        const prisma = app.get(PrismaService);
        if (await prisma.user.findUnique({ where: { id: user.id } })) {
          const session = await auth.login(user.email);
          await app
            .get(ProductService)
            .deleteUser(session.access_token, user.email);
        }
      }
      if (symbolId) {
        const prisma = app.get(PrismaService);
        await prisma.equityDailyBar.deleteMany({ where: { symbolId } });
        await prisma.symbol.delete({ where: { id: symbolId } });
      }
      await app.close();
    }
  }
}
main().catch(() => {
  console.error(
    'MySQL workspace verification failed. Inspect the disposable test database; no connection details were logged.',
  );
  process.exitCode = 1;
});
