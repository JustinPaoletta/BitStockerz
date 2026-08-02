import { Injectable } from '@nestjs/common';
import type {
  ExecutionRecord,
  OrderRecord,
  PaperAccountRecord,
  PositionRecord,
} from './trading.types';

@Injectable()
export class TradingMemoryStore {
  readonly paperAccountsByUserId = new Map<string, PaperAccountRecord>();
  readonly paperAccountsById = new Map<number, PaperAccountRecord>();
  readonly positionsByKey = new Map<string, PositionRecord>();
  readonly ordersById = new Map<string, OrderRecord>();
  readonly orderIdsByClientKey = new Map<string, string>();
  readonly executionsById = new Map<string, ExecutionRecord>();

  private nextPaperAccountId = 1;
  private nextPositionId = 1;
  private readonly accountLocks = new Map<number, Promise<void>>();

  allocatePaperAccountId(): number {
    return this.nextPaperAccountId++;
  }

  allocatePositionId(): number {
    return this.nextPositionId++;
  }

  positionKey(accountId: number, symbolId: number): string {
    return `${accountId}:${symbolId}`;
  }

  clientOrderKey(accountId: number, clientOrderId: string): string {
    return `${accountId}:${clientOrderId}`;
  }

  getPositionsForAccount(accountId: number): PositionRecord[] {
    return [...this.positionsByKey.values()].filter(
      (position) => position.paperAccountId === accountId,
    );
  }

  getOrdersForAccount(accountId: number): OrderRecord[] {
    return [...this.ordersById.values()].filter(
      (order) => order.paperAccountId === accountId,
    );
  }

  getExecutionsForAccount(accountId: number): ExecutionRecord[] {
    return [...this.executionsById.values()].filter(
      (execution) => execution.paperAccountId === accountId,
    );
  }

  async runAccountTransaction<T>(
    accountId: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const previous = this.accountLocks.get(accountId) ?? Promise.resolve();
    let release!: () => void;
    const active = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = previous.then(() => active);
    this.accountLocks.set(accountId, queue);
    await previous;

    const snapshot = this.snapshotAccount(accountId);
    try {
      return await work();
    } catch (error) {
      this.restoreAccount(accountId, snapshot);
      throw error;
    } finally {
      release();
      if (this.accountLocks.get(accountId) === queue) {
        this.accountLocks.delete(accountId);
      }
    }
  }

  resetForTests(): void {
    this.paperAccountsByUserId.clear();
    this.paperAccountsById.clear();
    this.positionsByKey.clear();
    this.ordersById.clear();
    this.orderIdsByClientKey.clear();
    this.executionsById.clear();
    this.accountLocks.clear();
    this.nextPaperAccountId = 1;
    this.nextPositionId = 1;
  }

  private snapshotAccount(accountId: number) {
    const account = this.paperAccountsById.get(accountId);
    return {
      account: account ? { ...account } : undefined,
      positions: this.getPositionsForAccount(accountId).map((item) => ({
        ...item,
      })),
      orders: this.getOrdersForAccount(accountId).map((item) => ({ ...item })),
      executions: this.getExecutionsForAccount(accountId).map((item) => ({
        ...item,
      })),
    };
  }

  private restoreAccount(
    accountId: number,
    snapshot: ReturnType<TradingMemoryStore['snapshotAccount']>,
  ): void {
    const currentAccount = this.paperAccountsById.get(accountId);
    if (currentAccount) {
      this.paperAccountsByUserId.delete(currentAccount.userId);
    }
    this.paperAccountsById.delete(accountId);
    if (snapshot.account) {
      this.paperAccountsById.set(accountId, snapshot.account);
      this.paperAccountsByUserId.set(snapshot.account.userId, snapshot.account);
    }

    for (const [key, position] of this.positionsByKey) {
      if (position.paperAccountId === accountId)
        this.positionsByKey.delete(key);
    }
    for (const position of snapshot.positions) {
      this.positionsByKey.set(
        this.positionKey(accountId, position.symbolId),
        position,
      );
    }

    for (const [id, order] of this.ordersById) {
      if (order.paperAccountId === accountId) this.ordersById.delete(id);
    }
    for (const [key] of this.orderIdsByClientKey) {
      if (key.startsWith(`${accountId}:`)) this.orderIdsByClientKey.delete(key);
    }
    for (const order of snapshot.orders) {
      this.ordersById.set(order.id, order);
      if (order.clientOrderId) {
        this.orderIdsByClientKey.set(
          this.clientOrderKey(accountId, order.clientOrderId),
          order.id,
        );
      }
    }

    for (const [id, execution] of this.executionsById) {
      if (execution.paperAccountId === accountId) {
        this.executionsById.delete(id);
      }
    }
    for (const execution of snapshot.executions) {
      this.executionsById.set(execution.id, execution);
    }
  }
}
