import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { MarketDataService } from '../market-data/market-data.service';
import { AuditService } from '../observability/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { FillPriceService } from './fill-price.service';
import { OrderRiskService } from './order-risk.service';
import { PaperAccountsService } from './paper-accounts.service';
import { PositionsService } from './positions.service';
import {
  cashNotional,
  decimal,
  formatMoney,
  formatTrading,
} from './trading-decimals';
import { TradingLedgerService } from './trading-ledger.service';
import { TradingMemoryStore } from './trading-memory.store';
import type {
  ExecutionRecord,
  ExecutionResponse,
  OrderRecord,
  OrderRejectReason,
  OrderResponse,
  OrderStatus,
  PlaceOrderInput,
  TradingTransaction,
} from './trading.types';

type PrismaOrderWithSymbol = Prisma.OrderGetPayload<{
  include: { symbol: { select: { symbol: true } } };
}>;
type PrismaExecutionWithSymbol = Prisma.ExecutionGetPayload<{
  include: { symbol: { select: { symbol: true } } };
}>;

interface PlacementResult {
  order: OrderRecord;
  replay: boolean;
}

const MAX_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: PaperAccountsService,
    private readonly positions: PositionsService,
    private readonly ledger: TradingLedgerService,
    private readonly prices: FillPriceService,
    private readonly risk: OrderRiskService,
    private readonly marketData: MarketDataService,
    private readonly memory: TradingMemoryStore,
    private readonly audit: AuditService,
  ) {}

  async placeMarketOrder(userId: string, input: PlaceOrderInput) {
    const account = await this.accounts.getForUser(userId);
    if (!account.isActive) {
      throw new DomainError(ErrorCode.TRADING_ACCOUNT_INACTIVE);
    }

    const symbol = await this.marketData.lookupSymbol(input.symbol);
    const quantity = decimal(input.quantity);
    const clientOrderId = input.clientOrderId?.trim() || null;
    const fastReplay = clientOrderId
      ? await this.findByClientOrderId(account.id, clientOrderId)
      : null;
    if (fastReplay) {
      this.assertReplayMatches(fastReplay, symbol.id, input.side, quantity);
      return { order: toOrderResponse(fastReplay, symbol.symbol) };
    }

    let fillPrice: Prisma.Decimal | null = null;
    try {
      fillPrice = (await this.prices.getLatestClose(symbol.symbol)).price;
    } catch (error) {
      if (!isDomainCode(error, ErrorCode.TRADING_NO_MARKET_PRICE)) throw error;
    }

    const normalized: NormalizedPlacement = {
      userId,
      accountId: account.id,
      symbolId: symbol.id,
      symbol: symbol.symbol,
      side: input.side,
      quantity,
      clientOrderId,
      fillPrice,
    };
    const result = this.prisma.isEnabled
      ? await this.placeWithPrisma(normalized)
      : await this.memory.runAccountTransaction(account.id, () =>
          this.placeInMemory(normalized),
        );

    if (!result.replay) {
      await this.audit.record({
        userId,
        eventType:
          result.order.status === 'FILLED'
            ? 'trading.order_filled'
            : 'trading.order_rejected',
        payload: {
          order_id: result.order.id,
          symbol: symbol.symbol,
          side: result.order.side,
          quantity: formatTrading(result.order.quantity),
          ...(result.order.rejectReason
            ? { reject_reason: result.order.rejectReason }
            : {}),
        },
      });
    }

    return { order: toOrderResponse(result.order, symbol.symbol) };
  }

  async listOrders(
    userId: string,
    options: {
      status?: OrderStatus;
      symbol?: string;
      limit: number;
      offset: number;
    },
  ) {
    const account = await this.accounts.getForUser(userId);
    const symbol = options.symbol
      ? await this.marketData.lookupSymbol(options.symbol)
      : undefined;

    if (this.prisma.isEnabled) {
      const records = await this.prisma.order.findMany({
        where: {
          paperAccountId: account.id,
          ...(options.status ? { status: options.status } : {}),
          ...(symbol ? { symbolId: symbol.id } : {}),
        },
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
        skip: options.offset,
        take: options.limit + 1,
        include: { symbol: { select: { symbol: true } } },
      });
      return pageOrders(records, options.limit, options.offset);
    }

    const records = this.memory
      .getOrdersForAccount(account.id)
      .filter(
        (order) =>
          (!options.status || order.status === options.status) &&
          (!symbol || order.symbolId === symbol.id),
      )
      .sort(
        (left, right) =>
          right.requestedAt.getTime() - left.requestedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .slice(options.offset, options.offset + options.limit + 1);
    const symbols = new Map(
      (
        await this.marketData.getSymbolsByIds(
          records.map((item) => item.symbolId),
        )
      ).map((item) => [item.id, item.symbol]),
    );
    return {
      orders: records
        .slice(0, options.limit)
        .map((record) =>
          toOrderResponse(record, symbols.get(record.symbolId) ?? 'UNKNOWN'),
        ),
      limit: options.limit,
      offset: options.offset,
      has_more: records.length > options.limit,
    };
  }

  async listExecutions(
    userId: string,
    options: { symbol?: string; limit: number; offset: number },
  ) {
    const account = await this.accounts.getForUser(userId);
    const symbol = options.symbol
      ? await this.marketData.lookupSymbol(options.symbol)
      : undefined;

    if (this.prisma.isEnabled) {
      const records = await this.prisma.execution.findMany({
        where: {
          paperAccountId: account.id,
          ...(symbol ? { symbolId: symbol.id } : {}),
        },
        orderBy: [{ executedAt: 'desc' }, { id: 'asc' }],
        skip: options.offset,
        take: options.limit + 1,
        include: { symbol: { select: { symbol: true } } },
      });
      return pageExecutions(records, options.limit, options.offset);
    }

    const records = this.memory
      .getExecutionsForAccount(account.id)
      .filter((execution) => !symbol || execution.symbolId === symbol.id)
      .sort(
        (left, right) =>
          right.executedAt.getTime() - left.executedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .slice(options.offset, options.offset + options.limit + 1);
    const symbols = new Map(
      (
        await this.marketData.getSymbolsByIds(
          records.map((item) => item.symbolId),
        )
      ).map((item) => [item.id, item.symbol]),
    );
    return {
      executions: records
        .slice(0, options.limit)
        .map((record) =>
          toExecutionResponse(
            record,
            symbols.get(record.symbolId) ?? 'UNKNOWN',
          ),
        ),
      limit: options.limit,
      offset: options.offset,
      has_more: records.length > options.limit,
    };
  }

  private async placeWithPrisma(
    input: NormalizedPlacement,
  ): Promise<PlacementResult> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.placeInTransaction(input, tx),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (isPrismaCode(error, 'P2002') && input.clientOrderId) {
          const winner = await this.findByClientOrderId(
            input.accountId,
            input.clientOrderId,
          );
          if (winner) {
            this.assertReplayMatches(
              winner,
              input.symbolId,
              input.side,
              input.quantity,
            );
            return { order: winner, replay: true };
          }
        }
        if (
          isPrismaCode(error, 'P2034') &&
          attempt < MAX_TRANSACTION_ATTEMPTS
        ) {
          continue;
        }
        throw error;
      }
    }
  }

  private async placeInTransaction(
    input: NormalizedPlacement,
    tx: TradingTransaction,
  ): Promise<PlacementResult> {
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM paper_accounts WHERE id = ${input.accountId} FOR UPDATE`,
    );
    const account = await tx.paperAccount.findUnique({
      where: { id: input.accountId },
    });
    if (!account?.isActive) {
      throw new DomainError(ErrorCode.TRADING_ACCOUNT_INACTIVE);
    }

    if (input.clientOrderId) {
      const existing = await tx.order.findUnique({
        where: {
          paperAccountId_clientOrderId: {
            paperAccountId: input.accountId,
            clientOrderId: input.clientOrderId,
          },
        },
      });
      if (existing) {
        const record = fromPrismaOrder(existing);
        this.assertReplayMatches(
          record,
          input.symbolId,
          input.side,
          input.quantity,
        );
        return { order: record, replay: true };
      }
    }

    const requestedAt = new Date();
    const pending = await tx.order.create({
      data: {
        id: randomUUID(),
        paperAccountId: input.accountId,
        symbolId: input.symbolId,
        side: input.side,
        quantity: input.quantity,
        orderType: 'MARKET',
        status: 'PENDING',
        clientOrderId: input.clientOrderId,
        requestedAt,
      },
    });

    const rejection = input.fillPrice
      ? await this.evaluateRisk(input, account.cashBalance, tx)
      : 'NO_MARKET_PRICE';
    if (rejection) {
      const rejected = await tx.order.update({
        where: { id: pending.id },
        data: { status: 'REJECTED', rejectReason: rejection },
      });
      return { order: fromPrismaOrder(rejected), replay: false };
    }

    try {
      await this.ledger.applyFill(
        {
          accountId: input.accountId,
          symbolId: input.symbolId,
          side: input.side,
          quantity: input.quantity,
          price: input.fillPrice as Prisma.Decimal,
        },
        tx,
      );
    } catch (error) {
      const reason = ledgerRejectReason(error);
      if (!reason) throw error;
      const rejected = await tx.order.update({
        where: { id: pending.id },
        data: { status: 'REJECTED', rejectReason: reason },
      });
      return { order: fromPrismaOrder(rejected), replay: false };
    }

    const filledAt = new Date();
    await tx.execution.create({
      data: {
        id: randomUUID(),
        orderId: pending.id,
        paperAccountId: input.accountId,
        symbolId: input.symbolId,
        side: input.side,
        quantity: input.quantity,
        price: input.fillPrice as Prisma.Decimal,
        executedAt: filledAt,
      },
    });
    const filled = await tx.order.update({
      where: { id: pending.id },
      data: {
        status: 'FILLED',
        avgFillPrice: input.fillPrice,
        filledAt,
      },
    });
    return { order: fromPrismaOrder(filled), replay: false };
  }

  private async placeInMemory(
    input: NormalizedPlacement,
  ): Promise<PlacementResult> {
    const account = this.memory.paperAccountsById.get(input.accountId);
    if (!account?.isActive) {
      throw new DomainError(ErrorCode.TRADING_ACCOUNT_INACTIVE);
    }
    if (input.clientOrderId) {
      const existing = await this.findByClientOrderId(
        input.accountId,
        input.clientOrderId,
      );
      if (existing) {
        this.assertReplayMatches(
          existing,
          input.symbolId,
          input.side,
          input.quantity,
        );
        return { order: existing, replay: true };
      }
    }

    const order: OrderRecord = {
      id: randomUUID(),
      paperAccountId: input.accountId,
      symbolId: input.symbolId,
      side: input.side,
      quantity: input.quantity,
      orderType: 'MARKET',
      status: 'PENDING',
      avgFillPrice: null,
      rejectReason: null,
      clientOrderId: input.clientOrderId,
      requestedAt: new Date(),
      filledAt: null,
    };
    const rejection = input.fillPrice
      ? await this.evaluateRisk(input, account.cashBalance)
      : 'NO_MARKET_PRICE';
    if (rejection) {
      order.status = 'REJECTED';
      order.rejectReason = rejection;
    } else {
      try {
        await this.ledger.applyFill(
          {
            accountId: input.accountId,
            symbolId: input.symbolId,
            side: input.side,
            quantity: input.quantity,
            price: input.fillPrice as Prisma.Decimal,
          },
          undefined,
          true,
        );
      } catch (error) {
        const reason = ledgerRejectReason(error);
        if (!reason) throw error;
        order.status = 'REJECTED';
        order.rejectReason = reason;
      }
      if (order.status === 'PENDING') {
        order.status = 'FILLED';
        order.avgFillPrice = input.fillPrice;
        order.filledAt = new Date();
        const execution: ExecutionRecord = {
          id: randomUUID(),
          orderId: order.id,
          paperAccountId: input.accountId,
          symbolId: input.symbolId,
          side: input.side,
          quantity: input.quantity,
          price: input.fillPrice as Prisma.Decimal,
          executedAt: order.filledAt,
        };
        this.memory.executionsById.set(execution.id, execution);
      }
    }

    this.memory.ordersById.set(order.id, order);
    if (order.clientOrderId) {
      this.memory.orderIdsByClientKey.set(
        this.memory.clientOrderKey(input.accountId, order.clientOrderId),
        order.id,
      );
    }
    return { order, replay: false };
  }

  private async evaluateRisk(
    input: NormalizedPlacement,
    cashBalance: Prisma.Decimal,
    tx?: TradingTransaction,
  ): Promise<OrderRejectReason | null> {
    const positions = await this.positions.listForAccount(input.accountId, tx);
    let closes: Map<number, Prisma.Decimal>;
    try {
      closes = await this.prices.getLatestClosesByIds(
        positions.map((position) => position.symbolId),
      );
    } catch (error) {
      if (isDomainCode(error, ErrorCode.TRADING_NO_MARKET_PRICE)) {
        return 'NO_MARKET_PRICE';
      }
      throw error;
    }
    closes.set(input.symbolId, input.fillPrice as Prisma.Decimal);

    let equity = decimal(cashBalance);
    for (const position of positions) {
      const price = closes.get(position.symbolId);
      if (!price) return 'NO_MARKET_PRICE';
      equity = equity.add(position.quantity.mul(price));
    }
    const currentPosition = positions.find(
      (position) => position.symbolId === input.symbolId,
    );
    return this.risk.evaluate({
      side: input.side,
      quantity: input.quantity,
      price: input.fillPrice as Prisma.Decimal,
      cashBalance,
      currentPositionQuantity: currentPosition?.quantity ?? decimal(0),
      preTradeEquity: equity,
    });
  }

  private async findByClientOrderId(
    accountId: number,
    clientOrderId: string,
  ): Promise<OrderRecord | null> {
    if (this.prisma.isEnabled) {
      const record = await this.prisma.order.findUnique({
        where: {
          paperAccountId_clientOrderId: {
            paperAccountId: accountId,
            clientOrderId,
          },
        },
      });
      return record ? fromPrismaOrder(record) : null;
    }
    const id = this.memory.orderIdsByClientKey.get(
      this.memory.clientOrderKey(accountId, clientOrderId),
    );
    return id ? (this.memory.ordersById.get(id) ?? null) : null;
  }

  private assertReplayMatches(
    existing: OrderRecord,
    symbolId: number,
    side: string,
    quantity: Prisma.Decimal,
  ): void {
    if (
      existing.symbolId !== symbolId ||
      existing.side !== side ||
      !existing.quantity.eq(quantity)
    ) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'client_order_id is already used for a different order payload.',
      );
    }
  }
}

interface NormalizedPlacement {
  userId: string;
  accountId: number;
  symbolId: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: Prisma.Decimal;
  clientOrderId: string | null;
  fillPrice: Prisma.Decimal | null;
}

function fromPrismaOrder(record: Prisma.OrderGetPayload<object>): OrderRecord {
  return {
    ...record,
    side: record.side as OrderRecord['side'],
    orderType: 'MARKET',
    status: record.status as OrderStatus,
    rejectReason: record.rejectReason as OrderRejectReason | null,
  };
}

export function toOrderResponse(
  record: OrderRecord,
  symbol: string,
): OrderResponse {
  return {
    id: record.id,
    symbol,
    side: record.side,
    quantity: formatTrading(record.quantity),
    status: record.status,
    ...(record.avgFillPrice
      ? { avg_fill_price: formatTrading(record.avgFillPrice) }
      : {}),
    ...(record.rejectReason ? { reject_reason: record.rejectReason } : {}),
    requested_at: record.requestedAt.toISOString(),
    ...(record.filledAt ? { filled_at: record.filledAt.toISOString() } : {}),
    ...(record.clientOrderId ? { client_order_id: record.clientOrderId } : {}),
  };
}

function toExecutionResponse(
  record: ExecutionRecord,
  symbol: string,
): ExecutionResponse {
  return {
    executed_at: record.executedAt.toISOString(),
    symbol,
    side: record.side,
    quantity: formatTrading(record.quantity),
    price: formatTrading(record.price),
    notional: formatMoney(cashNotional(record.quantity, record.price)),
  };
}

function pageOrders(
  records: PrismaOrderWithSymbol[],
  limit: number,
  offset: number,
) {
  return {
    orders: records
      .slice(0, limit)
      .map((record) =>
        toOrderResponse(fromPrismaOrder(record), record.symbol.symbol),
      ),
    limit,
    offset,
    has_more: records.length > limit,
  };
}

function pageExecutions(
  records: PrismaExecutionWithSymbol[],
  limit: number,
  offset: number,
) {
  return {
    executions: records.slice(0, limit).map((record) =>
      toExecutionResponse(
        {
          ...record,
          side: record.side as ExecutionRecord['side'],
        },
        record.symbol.symbol,
      ),
    ),
    limit,
    offset,
    has_more: records.length > limit,
  };
}

function ledgerRejectReason(error: unknown): OrderRejectReason | null {
  if (isDomainCode(error, ErrorCode.TRADING_INSUFFICIENT_CASH)) {
    return 'INSUFFICIENT_CASH';
  }
  if (isDomainCode(error, ErrorCode.TRADING_INSUFFICIENT_POSITION)) {
    return 'INSUFFICIENT_POSITION';
  }
  return null;
}

function isDomainCode(error: unknown, code: ErrorCode): boolean {
  return error instanceof DomainError && error.code === code;
}

function isPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === code
  );
}
