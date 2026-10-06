import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, type PaperAutomation } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { computeIndicators } from '../backtest/engine/indicators';
import { evaluateRules } from '../backtest/engine/rules';
import { AppConfigService } from '../config/app-config.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { MarketDataService } from '../market-data/market-data.service';
import { PrismaService } from '../prisma/prisma.service';
import { StrategiesService } from '../strategies/strategies.service';
import { OrdersService } from '../trading/orders.service';
import { PaperAccountsService } from '../trading/paper-accounts.service';
import { PositionsService } from '../trading/positions.service';
import type { OrderResponse } from '../trading/trading.types';
import { decimal, formatTrading } from '../trading/trading-decimals';

interface Activity {
  at: string;
  event: string;
  bar?: string;
  order_id?: string;
  reason?: string;
}
interface Pending {
  bar: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  client_id: string;
}
interface State {
  quantity: string;
  entry_price: string;
  realized_pnl: string;
  closed_trades: number;
  last_bar?: string;
  pending?: Pending;
  activity: Activity[];
}
const initialState = (): State => ({
  quantity: '0',
  entry_price: '0',
  realized_pnl: '0',
  closed_trades: 0,
  activity: [],
});

@Injectable()
export class AutomationService {
  private readonly records = new Map<string, PaperAutomation>();
  private readonly locks = new Map<string, Promise<void>>();
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly strategies: StrategiesService,
    private readonly market: MarketDataService,
    private readonly orders: OrdersService,
    private readonly accounts: PaperAccountsService,
    private readonly positions: PositionsService,
  ) {}

  async runUserWork<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(userId, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(userId) === tail) this.locks.delete(userId);
    }
  }
  async list(userId: string) {
    return this.prisma.isEnabled
      ? this.prisma.paperAutomation.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 100,
        })
      : [...this.records.values()]
          .filter((item) => item.userId === userId)
          .map((item) => structuredCloneRecord(item));
  }
  async create(
    userId: string,
    input: { strategy_id: string; symbol: string; allocation_pct: number },
  ) {
    return this.runUserWork(userId, async () => {
      const rows = await this.list(userId);
      if (rows.filter((item) => item.status !== 'stopped').length >= 20)
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          'At most 20 strategy runners per account.',
        );
      const version = await this.strategies.resolveOwnedVersion(
        userId,
        input.strategy_id,
      );
      const symbol = await this.market.lookupSymbol(input.symbol);
      if (symbol.asset_type !== version.assetType)
        throw new DomainError(
          ErrorCode.VALIDATION_ERROR,
          'Symbol and strategy asset types must match.',
        );
      if (
        rows.some(
          (item) =>
            item.symbolId === symbol.id &&
            (item.status !== 'stopped' ||
              decimal(this.state(item).quantity).gt(0)),
        )
      )
        throw new DomainError(
          ErrorCode.CONFLICT,
          'A runner already reserves this symbol. Stop it before creating another.',
        );
      const account = await this.accounts.getForUser(userId);
      if (await this.positions.find(account.id, symbol.id))
        throw new DomainError(
          ErrorCode.CONFLICT,
          'Close the existing manual position before assigning this symbol to a runner.',
        );
      const now = new Date();
      const record: PaperAutomation = {
        id: randomUUID(),
        userId,
        strategyId: input.strategy_id,
        strategyVersionId: version.strategyVersionId,
        symbolId: symbol.id,
        timeframe: version.timeframe,
        status: 'paused',
        allocationPct: new Prisma.Decimal(input.allocation_pct),
        stateJson: this.json(initialState()) as Prisma.JsonValue,
        createdAt: now,
        updatedAt: now,
      };
      if (this.prisma.isEnabled)
        return this.prisma.paperAutomation.create({
          data: { ...record, stateJson: this.json(initialState()) },
        });
      this.records.set(record.id, record);
      return structuredCloneRecord(record);
    });
  }
  async control(
    userId: string,
    id: string,
    status: 'active' | 'paused' | 'stopped',
  ) {
    return this.runUserWork(userId, async () => {
      const record = await this.owned(userId, id);
      if (record.status === 'stopped')
        throw new DomainError(
          ErrorCode.CONFLICT,
          'A stopped runner is archived. Create a new runner.',
        );
      if (
        status === 'stopped' &&
        (decimal(this.state(record).quantity).gt(0) ||
          this.state(record).pending)
      )
        throw new DomainError(
          ErrorCode.CONFLICT,
          'Pause to hold an open position, or let the runner exit before stopping.',
        );
      record.status = status;
      const state = this.state(record);
      this.log(state, status);
      await this.save(record, state);
      return record;
    });
  }
  async evaluate(userId: string, id: string, now = new Date()) {
    return this.runUserWork(userId, async () => {
      const record = await this.owned(userId, id);
      if (record.status !== 'active') return record;
      const state = this.state(record);
      try {
        await this.evaluateRecord(record, state, now);
      } catch (error) {
        record.status = 'paused';
        this.log(
          state,
          'error',
          undefined,
          error instanceof DomainError ? error.code : 'EXECUTION_UNAVAILABLE',
        );
        await this.save(record, state);
      }
      return record;
    });
  }
  @Cron('20 * * * *', { name: 'paper-strategy-evaluation' })
  async tick(): Promise<void> {
    if (
      !this.config.jobs.schedulerEnabled ||
      !this.prisma.isEnabled ||
      this.running
    )
      return;
    this.running = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const rows: PaperAutomation[] =
          await this.prisma.paperAutomation.findMany({
            where: { status: 'active' },
            orderBy: { id: 'asc' },
            take: 50,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          });
        for (const record of rows)
          await this.evaluate(record.userId, record.id);
        if (rows.length < 50) break;
        cursor = rows[rows.length - 1].id;
      }
    } finally {
      this.running = false;
    }
  }
  stopMemoryForUser(userId: string): void {
    for (const record of this.records.values())
      if (record.userId === userId) {
        record.status = 'stopped';
        record.stateJson = this.json(initialState()) as Prisma.JsonValue;
      }
  }
  forgetUser(userId: string): void {
    for (const [id, record] of this.records)
      if (record.userId === userId) this.records.delete(id);
  }
  private async owned(userId: string, id: string) {
    const record = this.prisma.isEnabled
      ? await this.prisma.paperAutomation.findFirst({ where: { id, userId } })
      : this.records.get(id);
    if (!record || record.userId !== userId)
      throw new DomainError(ErrorCode.NOT_FOUND);
    return structuredCloneRecord(record);
  }
  private state(record: PaperAutomation): State {
    return JSON.parse(JSON.stringify(record.stateJson)) as State;
  }
  private json(state: State): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(state)) as Prisma.InputJsonValue;
  }
  private log(
    state: State,
    event: string,
    bar?: string,
    reason?: string,
    order_id?: string,
  ) {
    state.activity.push({
      at: new Date().toISOString(),
      event,
      ...(bar ? { bar } : {}),
      ...(reason ? { reason } : {}),
      ...(order_id ? { order_id } : {}),
    });
    state.activity = state.activity.slice(-100);
  }
  private async save(record: PaperAutomation, state: State) {
    record.stateJson = this.json(state) as Prisma.JsonValue;
    record.updatedAt = new Date();
    if (this.prisma.isEnabled)
      await this.prisma.paperAutomation.update({
        where: { id: record.id },
        data: {
          status: record.status,
          stateJson: this.json(state),
          updatedAt: record.updatedAt,
        },
      });
    else this.records.set(record.id, structuredCloneRecord(record));
  }
  private applyOrder(state: State, pending: Pending, order: OrderResponse) {
    if (order.status === 'FILLED' && order.avg_fill_price) {
      if (pending.side === 'BUY') {
        state.quantity = order.quantity;
        state.entry_price = order.avg_fill_price;
      } else {
        state.realized_pnl = formatTrading(
          decimal(state.realized_pnl).add(
            decimal(order.avg_fill_price)
              .sub(state.entry_price)
              .mul(order.quantity),
          ),
        );
        state.quantity = '0';
        state.closed_trades++;
      }
    }
    state.last_bar = pending.bar;
    delete state.pending;
    this.log(
      state,
      order.status.toLowerCase(),
      pending.bar,
      order.reject_reason,
      order.id,
    );
  }
  private async evaluateRecord(
    record: PaperAutomation,
    state: State,
    now: Date,
  ) {
    // Replay an already committed order before reading prices; a restart must not lose attribution.
    if (state.pending) {
      const existing = await this.orders.findOwnedClientOrder(
        record.userId,
        state.pending.client_id,
      );
      if (existing) {
        this.applyOrder(state, state.pending, existing);
        await this.save(record, state);
      }
    }
    const symbol = await this.market.requireActiveSymbolById(record.symbolId);
    const latest = await this.market.getLatestClose(
      symbol.symbol,
      now,
      record.timeframe as '1d' | '1h',
    );
    // Paper orders use the account's latest close. Reject mismatched series and incomplete bars.
    const interval = record.timeframe === '1d' ? 86400000 : 3600000;
    const last = new Date(latest.as_of);
    if (
      latest.interval !== record.timeframe ||
      last.getTime() + interval > now.getTime()
    )
      throw new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE);
    if (state.pending && state.pending.bar !== latest.as_of) {
      delete state.pending;
      throw new DomainError(ErrorCode.CONFLICT, 'Pending signal expired.');
    }
    if (state.last_bar === latest.as_of) return;
    const version = await this.strategies.resolveOwnedVersion(
      record.userId,
      record.strategyId,
      record.strategyVersionId,
    );
    const bars = await this.market.getBacktestBars({
      symbolId: record.symbolId,
      assetType: version.assetType,
      timeframe: version.timeframe,
      start: new Date(last.getTime() - interval * 4000),
      end: last,
      limit: 4001,
    });
    if (!bars.length || bars[bars.length - 1].ts.getTime() !== last.getTime())
      throw new DomainError(ErrorCode.TRADING_NO_MARKET_PRICE);
    const account = await this.accounts.getForUser(record.userId);
    const position = await this.positions.find(account.id, record.symbolId);
    if (
      !decimal(position?.quantity ?? 0).eq(state.quantity) ||
      (position &&
        decimal(state.quantity).gt(0) &&
        !decimal(position.avgCost).eq(state.entry_price))
    )
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Manual position changes require review.',
      );
    if (!state.pending) {
      const indicators = computeIndicators(version.definition.indicators, bars);
      const context = { bars, indicators, index: bars.length - 1 };
      const held = decimal(state.quantity).gt(0);
      const price = Number(latest.price);
      const entry = Number(state.entry_price);
      const risk = version.definition.risk;
      const riskExit =
        held &&
        (price <= entry * (1 - risk.stop_loss.value / 100) ||
          price >= entry * (1 + risk.take_profit.value / 100));
      const signal = held
        ? riskExit || evaluateRules(version.definition.exit, context)
        : evaluateRules(version.definition.entry, context);
      this.log(state, signal ? 'signal' : 'evaluated', latest.as_of);
      if (!signal) {
        state.last_bar = latest.as_of;
        await this.save(record, state);
        return;
      }
      const side = held ? 'SELL' : 'BUY';
      const quantity = held
        ? state.quantity
        : decimal(account.cashBalance)
            .mul(record.allocationPct)
            .div(100)
            .div(latest.price)
            .toDecimalPlaces(8, Prisma.Decimal.ROUND_DOWN)
            .toFixed(8);
      if (!decimal(quantity).gt(0))
        throw new DomainError(ErrorCode.VALIDATION_ERROR);
      state.pending = {
        bar: latest.as_of,
        side,
        quantity,
        client_id: createHash('sha256')
          .update(`${record.id}:${latest.as_of}:${side}`)
          .digest('hex'),
      };
      await this.save(record, state); // Durable intent before the idempotent ledger call.
    }
    const pending = state.pending;
    const placed = await this.orders.placeMarketOrder(record.userId, {
      symbol: symbol.symbol,
      side: pending.side,
      quantity: pending.quantity,
      clientOrderId: pending.client_id,
      expectedClose: {
        asOf: pending.bar,
        interval: record.timeframe,
      },
    });
    this.applyOrder(state, pending, placed.order);
    await this.save(record, state);
  }
}
function structuredCloneRecord(record: PaperAutomation): PaperAutomation {
  return {
    ...record,
    stateJson: JSON.parse(JSON.stringify(record.stateJson)) as Prisma.JsonValue,
  };
}
