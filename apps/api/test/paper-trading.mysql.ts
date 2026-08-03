import assert from 'node:assert/strict';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/trading/orders.service';
import { PaperAccountsService } from '../src/trading/paper-accounts.service';
import { TradingViewsService } from '../src/trading/trading-views.service';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the MySQL trading smoke.');
  }

  let app: INestApplicationContext | undefined;
  let currentUserId: string | undefined;
  let symbolId: number | undefined;
  let highPriceSymbolId: number | undefined;
  let email: string | undefined;
  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    let auth = app.get(AuthService);
    let accounts = app.get(PaperAccountsService);
    let orders = app.get(OrdersService);
    let views = app.get(TradingViewsService);
    let prisma = app.get(PrismaService);
    assert.equal(
      prisma.isEnabled,
      true,
      'Prisma must be enabled in this smoke',
    );

    const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    email = `trading-smoke-${suffix}@example.com`;
    const registration = auth.register(email, 'Trading Persistence Smoke');
    currentUserId = registration.user.id;
    await auth.ensurePaperAccountForUser(currentUserId);
    const account = await accounts.getForUser(currentUserId);
    assert.equal(account.startingBalance.toFixed(2), '100000.00');
    assert.equal(account.cashBalance.toFixed(2), '100000.00');

    const symbol = await prisma.symbol.create({
      data: {
        symbol: `TRD-${crypto.randomUUID().slice(0, 12)}`.toUpperCase(),
        name: 'Paper Trading Persistence Smoke Symbol',
        assetType: 'EQUITY',
        exchange: 'TEST',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    symbolId = symbol.id;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await prisma.equityDailyBar.create({
      data: {
        symbolId,
        date: today,
        open: '100',
        high: '100',
        low: '100',
        close: '100',
        volume: 1_000,
        provider: 'mysql-smoke',
        createdAt: new Date(),
      },
    });

    const buyInput = {
      symbol: symbol.symbol,
      side: 'BUY' as const,
      quantity: '10',
      clientOrderId: `mysql-buy-${suffix}`,
    };
    const [buy, replay] = await Promise.all([
      orders.placeMarketOrder(currentUserId, buyInput),
      orders.placeMarketOrder(currentUserId, buyInput),
    ]);
    assert.equal(buy.order.status, 'FILLED');
    assert.equal(replay.order.id, buy.order.id);
    assert.equal(
      await prisma.execution.count({ where: { orderId: buy.order.id } }),
      1,
      'an idempotency race must create one execution',
    );

    const riskReject = await orders.placeMarketOrder(currentUserId, {
      symbol: symbol.symbol,
      side: 'BUY',
      quantity: '500',
      clientOrderId: `mysql-risk-${suffix}`,
    });
    assert.equal(riskReject.order.status, 'REJECTED');
    assert.equal(riskReject.order.reject_reason, 'MAX_ORDER_NOTIONAL');

    const sell = await orders.placeMarketOrder(currentUserId, {
      symbol: symbol.symbol,
      side: 'SELL',
      quantity: '4',
      clientOrderId: `mysql-sell-${suffix}`,
    });
    assert.equal(sell.order.status, 'FILLED');
    assert.equal(
      (await accounts.getForUser(currentUserId)).cashBalance.toFixed(2),
      '99400.00',
    );

    const positions = await views.listPositions(currentUserId);
    assert.deepEqual(positions.positions, [
      {
        symbol: symbol.symbol,
        quantity: '6.00000000',
        avg_cost: '100.00000000',
      },
    ]);
    assert.deepEqual(await views.getPortfolioSummary(currentUserId), {
      cash_balance: '99400.00',
      total_position_value: '600.00',
      total_equity: '100000.00',
      unrealized_pnl_total: '0.00',
    });
    assert.equal(
      (await orders.listOrders(currentUserId, { limit: 20, offset: 0 })).orders
        .length,
      3,
    );
    assert.equal(
      (
        await orders.listExecutions(currentUserId, {
          limit: 20,
          offset: 0,
        })
      ).executions.length,
      2,
    );

    const highPriceSymbol = await prisma.symbol.create({
      data: {
        symbol: `ZTRD-${crypto.randomUUID().slice(0, 11)}`.toUpperCase(),
        name: 'Paper Trading High Price Boundary Symbol',
        assetType: 'EQUITY',
        exchange: 'TEST',
        currency: 'USD',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    highPriceSymbolId = highPriceSymbol.id;
    const highPrice = '999999999999.999999';
    await prisma.equityDailyBar.create({
      data: {
        symbolId: highPriceSymbol.id,
        date: today,
        open: highPrice,
        high: highPrice,
        low: highPrice,
        close: highPrice,
        volume: 1,
        provider: 'mysql-smoke-price-boundary',
        createdAt: new Date(),
      },
    });

    const highPriceBuy = await orders.placeMarketOrder(currentUserId, {
      symbol: highPriceSymbol.symbol,
      side: 'BUY',
      quantity: '0.00000001',
      clientOrderId: `mysql-high-price-${suffix}`,
    });
    assert.equal(highPriceBuy.order.status, 'FILLED');
    assert.equal(highPriceBuy.order.avg_fill_price, '999999999999.99999900');
    const highPricePosition = await prisma.position.findUniqueOrThrow({
      where: {
        paperAccountId_symbolId: {
          paperAccountId: account.id,
          symbolId: highPriceSymbol.id,
        },
      },
    });
    assert.equal(
      highPricePosition.avgCost.toFixed(8),
      highPriceBuy.order.avg_fill_price,
    );
    const highPriceExecution = await prisma.execution.findFirstOrThrow({
      where: { orderId: highPriceBuy.order.id },
    });
    assert.equal(
      highPriceExecution.price.toFixed(8),
      highPriceBuy.order.avg_fill_price,
    );
    assert.equal(
      (await accounts.getForUser(currentUserId)).cashBalance.toFixed(2),
      '89400.00',
    );

    const originalAccountId = account.id;
    await app.close();
    app = undefined;
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    auth = app.get(AuthService);
    accounts = app.get(PaperAccountsService);
    orders = app.get(OrdersService);
    views = app.get(TradingViewsService);
    prisma = app.get(PrismaService);
    const restarted = auth.register(email, 'Trading Persistence Restart');
    currentUserId = restarted.user.id;
    const restartedAccount = await accounts.getForUser(currentUserId);
    assert.equal(restartedAccount.id, originalAccountId);
    assert.equal(restartedAccount.cashBalance.toFixed(2), '89400.00');
    assert.equal(
      (await views.listPositions(currentUserId)).positions[0]?.quantity,
      '6.00000000',
    );
    assert.equal(
      (
        await orders.listExecutions(currentUserId, {
          symbol: symbol.symbol,
          limit: 20,
          offset: 0,
        })
      ).executions.length,
      2,
    );
    assert.equal(
      (
        await orders.listExecutions(currentUserId, {
          symbol: highPriceSymbol.symbol,
          limit: 20,
          offset: 0,
        })
      ).executions[0]?.price,
      '999999999999.99999900',
    );

    process.stdout.write(
      'Paper trading MySQL smoke PASS: provisioning, serializable fill, idempotency race, risk reject, full market-price range persistence, valuation, history, and restart ownership remap verified.\n',
    );
  } finally {
    if (app) {
      const prisma = app.get(PrismaService);
      if (prisma.isEnabled) {
        await prisma.$transaction(async (transaction) => {
          if (currentUserId) {
            const account = await transaction.paperAccount.findUnique({
              where: { userId: currentUserId },
            });
            if (account) {
              await transaction.execution.deleteMany({
                where: { paperAccountId: account.id },
              });
              await transaction.order.deleteMany({
                where: { paperAccountId: account.id },
              });
              await transaction.position.deleteMany({
                where: { paperAccountId: account.id },
              });
              await transaction.paperAccount.delete({
                where: { id: account.id },
              });
            }
            await transaction.auditEvent.deleteMany({
              where: { userId: currentUserId },
            });
            await transaction.user.deleteMany({
              where: { id: currentUserId },
            });
          }
          if (symbolId) {
            await transaction.equityDailyBar.deleteMany({
              where: { symbolId },
            });
            await transaction.symbol.deleteMany({ where: { id: symbolId } });
          }
          if (highPriceSymbolId) {
            await transaction.equityDailyBar.deleteMany({
              where: { symbolId: highPriceSymbolId },
            });
            await transaction.symbol.deleteMany({
              where: { id: highPriceSymbolId },
            });
          }
        });
      }
      await app.close();
    }
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `Paper trading MySQL smoke FAIL: ${
      error instanceof Error ? error.stack : String(error)
    }\n`,
  );
  process.exitCode = 1;
});
