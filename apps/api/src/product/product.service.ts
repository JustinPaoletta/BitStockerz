import { AutomationService } from '../automation/automation.service';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { BacktestsRepository } from '../backtest/backtests.repository';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { JobsService } from '../jobs/jobs.service';
import { MarketDataService } from '../market-data/market-data.service';
import { AuditService } from '../observability/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { StrategiesService } from '../strategies/strategies.service';
import { PaperAccountsService } from '../trading/paper-accounts.service';
import { TradingMemoryStore } from '../trading/trading-memory.store';

export function serializable<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class ProductService {
  private readonly watchlists = new Map<string, Set<number>>();
  private readonly archives: {
    id: string;
    userId: string;
    snapshotJson: Prisma.InputJsonValue;
    createdAt: Date;
  }[] = [];
  constructor(
    private readonly automation: AutomationService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly market: MarketDataService,
    private readonly accounts: PaperAccountsService,
    private readonly memory: TradingMemoryStore,
    private readonly strategies: StrategiesService,
    private readonly backtests: BacktestsRepository,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  get dataMode(): 'database' | 'seed' {
    return this.prisma.isEnabled ? 'database' : 'seed';
  }

  async watchlist(userId: string) {
    const ids = this.prisma.isEnabled
      ? (
          await this.prisma.watchlistEntry.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
          })
        ).map((item) => item.symbolId)
      : [...(this.watchlists.get(userId) ?? [])];
    return { symbols: await this.market.getSymbolsByIds(ids) };
  }
  async saveWatchlistSymbol(userId: string, symbol: string): Promise<void> {
    const found = await this.market.lookupSymbol(symbol);
    if (!found.is_active) throw new DomainError(ErrorCode.NOT_FOUND);
    const existing = await this.watchlist(userId);
    if (
      existing.symbols.length >= 100 &&
      !existing.symbols.some((item) => item.id === found.id)
    )
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Watchlists support up to 100 symbols.',
      );
    if (this.prisma.isEnabled)
      await this.prisma.watchlistEntry.upsert({
        where: { userId_symbolId: { userId, symbolId: found.id } },
        create: { userId, symbolId: found.id, createdAt: new Date() },
        update: {},
      });
    else {
      const ids = this.watchlists.get(userId) ?? new Set<number>();
      ids.add(found.id);
      this.watchlists.set(userId, ids);
    }
  }
  async removeWatchlistSymbol(userId: string, symbol: string): Promise<void> {
    const found = await this.market.lookupSymbol(symbol);
    if (this.prisma.isEnabled)
      await this.prisma.watchlistEntry.deleteMany({
        where: { userId, symbolId: found.id },
      });
    else this.watchlists.get(userId)?.delete(found.id);
  }
  async accountArchives(userId: string) {
    const archives: { id: string; createdAt: Date; snapshotJson: unknown }[] =
      this.prisma.isEnabled
        ? await this.prisma.paperAccountArchive.findMany({
            where: { userId },
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          })
        : this.archives.filter((item) => item.userId === userId);
    return {
      archives: archives.map((item) => ({
        id: item.id,
        created_at: item.createdAt.toISOString(),
        snapshot: item.snapshotJson,
      })),
    };
  }
  async resetAccount(token: string): Promise<void> {
    const user = this.auth.requireUserBySessionToken(token);
    return this.automation.runUserWork(user.id, () =>
      this.resetAccountLocked(token),
    );
  }
  private async resetAccountLocked(token: string): Promise<void> {
    await this.auth.assertRecentSession(token);
    const user = this.auth.requireUserBySessionToken(token);
    const account = await this.accounts.getForUser(user.id);
    const now = new Date();
    const previousAutomations = await this.automation.list(user.id);
    if (this.prisma.isEnabled) {
      await this.prisma.$transaction(
        async (tx) => {
          // Acquire the account write lock before reading the ledger snapshot.
          const locked = await tx.paperAccount.update({
            where: { id: account.id },
            data: { updatedAt: now },
          });
          const [positions, orders, executions] = await Promise.all([
            tx.position.findMany({ where: { paperAccountId: account.id } }),
            tx.order.findMany({ where: { paperAccountId: account.id } }),
            tx.execution.findMany({ where: { paperAccountId: account.id } }),
          ]);
          await tx.paperAccountArchive.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              snapshotJson: serializable({
                account: locked,
                positions,
                orders,
                executions,
                automations: previousAutomations,
              }),
              createdAt: now,
            },
          });
          const keys = orders
            .filter((item) => item.clientOrderId)
            .map((item) => ({
              paperAccountId: account.id,
              clientOrderId: item.clientOrderId!,
            }));
          if (keys.length)
            await tx.paperResetKey.createMany({
              data: keys,
              skipDuplicates: true,
            });
          await tx.execution.deleteMany({
            where: { paperAccountId: account.id },
          });
          await tx.order.deleteMany({ where: { paperAccountId: account.id } });
          await tx.position.deleteMany({
            where: { paperAccountId: account.id },
          });
          await tx.paperAutomation.updateMany({
            where: { userId: user.id },
            data: {
              status: 'stopped',
              stateJson: {
                quantity: '0',
                entry_price: '0',
                realized_pnl: '0',
                closed_trades: 0,
                activity: [],
              },
              updatedAt: now,
            },
          });
          await tx.paperAccount.update({
            where: { id: account.id },
            data: { cashBalance: locked.startingBalance, updatedAt: now },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
        },
      );
    } else {
      await this.memory.runAccountTransaction(account.id, () => {
        const orders = this.memory.getOrdersForAccount(account.id);
        const archive = {
          id: randomUUID(),
          userId: user.id,
          snapshotJson: serializable({
            account,
            orders,
            automations: previousAutomations,
            positions: this.memory.getPositionsForAccount(account.id),
            executions: this.memory.getExecutionsForAccount(account.id),
          }),
          createdAt: now,
        };
        for (const order of orders)
          if (order.clientOrderId)
            this.memory.retiredClientKeys.add(
              this.memory.clientOrderKey(account.id, order.clientOrderId),
            );
        this.clearMemoryLedger(account.id);
        account.cashBalance = account.startingBalance;
        account.updatedAt = now;
        this.archives.push(archive);
        return Promise.resolve();
      });
    }
    this.automation.stopMemoryForUser(user.id);
    await this.audit.record({
      userId: user.id,
      eventType: 'paper_account.reset',
      payload: { paper_account_id: account.id },
    });
  }
  async exportUser(token: string) {
    const user = this.auth.requireUserBySessionToken(token);
    const profile = this.auth.getProfileBySessionToken(token);
    if (!this.prisma.isEnabled) {
      const account = this.memory.paperAccountsByUserId.get(user.id);
      return serializable({
        exported_at: new Date(),
        profile,
        sign_in_methods: this.auth.listPasskeys(token),
        sessions: this.auth.listSessions(token),
        strategies: this.strategies.exportMemoryForUser(user.id),
        backtests: this.backtests.exportMemoryForUser(user.id),
        jobs: this.jobs.exportMemoryForUser(user.id),
        audit_events: this.audit.exportMemoryForUser(user.id),
        watchlist: await this.watchlist(user.id),
        automations: await this.automation.list(user.id),
        paper_account: account,
        positions: account
          ? this.memory.getPositionsForAccount(account.id)
          : [],
        orders: account ? this.memory.getOrdersForAccount(account.id) : [],
        executions: account
          ? this.memory.getExecutionsForAccount(account.id)
          : [],
        archives: (await this.accountArchives(user.id)).archives,
      });
    }
    return this.prisma.$transaction(
      async (tx) => {
        const [
          strategies,
          backtests,
          account,
          jobs,
          audit,
          watchlist,
          archives,
          automations,
          usage,
        ] = await Promise.all([
          tx.strategy.findMany({
            where: { userId: user.id },
            include: { versions: true },
          }),
          tx.backtestRun.findMany({
            where: { userId: user.id },
            include: { result: true, trades: true, equityPoints: true },
          }),
          tx.paperAccount.findUnique({
            where: { userId: user.id },
            include: { positions: true, orders: true, executions: true },
          }),
          tx.job.findMany({ where: { userId: user.id } }),
          tx.auditEvent.findMany({ where: { userId: user.id } }),
          tx.watchlistEntry.findMany({ where: { userId: user.id } }),
          tx.paperAccountArchive.findMany({ where: { userId: user.id } }),
          tx.paperAutomation.findMany({ where: { userId: user.id } }),
          tx.aiUsage.findMany({ where: { userId: user.id } }),
        ]);
        return serializable({
          exported_at: new Date(),
          profile,
          sign_in_methods: this.auth.listPasskeys(token),
          sessions: this.auth.listSessions(token),
          strategies,
          backtests,
          paper_account: account,
          jobs,
          audit_events: audit,
          watchlist,
          archives,
          automations,
          ai_usage: usage,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
  async deleteUser(token: string, confirmation: string): Promise<void> {
    const user = this.auth.requireUserBySessionToken(token);
    return this.automation.runUserWork(user.id, () =>
      this.deleteUserLocked(token, confirmation),
    );
  }
  private async deleteUserLocked(
    token: string,
    confirmation: string,
  ): Promise<void> {
    await this.auth.assertRecentSession(token);
    const user = this.auth.requireUserBySessionToken(token);
    if (confirmation !== user.email)
      throw new DomainError(
        ErrorCode.VALIDATION_ERROR,
        'Type your account email to confirm deletion.',
      );
    await this.auth.beginAccountDeletion(user.id);
    try {
      if (this.prisma.isEnabled)
        await this.prisma.$transaction(
          async (tx) => {
            const active = await tx.job.count({
              where: {
                userId: user.id,
                status: { in: ['pending', 'running'] },
              },
            });
            if (active)
              throw new DomainError(
                ErrorCode.CONFLICT,
                'Wait for running jobs to finish before deleting your account.',
              );
            const account = await tx.paperAccount.findUnique({
              where: { userId: user.id },
            });
            if (account) {
              await tx.paperResetKey.deleteMany({
                where: { paperAccountId: account.id },
              });
              await tx.execution.deleteMany({
                where: { paperAccountId: account.id },
              });
              await tx.order.deleteMany({
                where: { paperAccountId: account.id },
              });
              await tx.position.deleteMany({
                where: { paperAccountId: account.id },
              });
              await tx.paperAccount.delete({ where: { id: account.id } });
            }
            await tx.backtestRun.deleteMany({ where: { userId: user.id } });
            await tx.strategyVersion.deleteMany({
              where: { strategy: { userId: user.id } },
            });
            await tx.strategy.deleteMany({ where: { userId: user.id } });
            await tx.job.deleteMany({ where: { userId: user.id } });
            await tx.aiUsage.deleteMany({ where: { userId: user.id } });
            await tx.auditEvent.deleteMany({ where: { userId: user.id } });
            await tx.webAuthnCredential.deleteMany({
              where: { userId: user.id },
            });
            await tx.webAuthnChallenge.deleteMany({
              where: { email: user.email },
            });
            await tx.oAuthState.deleteMany({
              where: { initiatingUserId: user.id },
            });
            await tx.oAuthHandoff.deleteMany({ where: { userId: user.id } });
            await tx.user.delete({ where: { id: user.id } });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 30000,
          },
        );
      else {
        if (
          this.jobs
            .exportMemoryForUser(user.id)
            .some((item) => ['pending', 'running'].includes(item.status))
        )
          throw new DomainError(
            ErrorCode.CONFLICT,
            'Wait for running jobs to finish before deleting your account.',
          );
        const account = this.memory.paperAccountsByUserId.get(user.id);
        if (account)
          await this.memory.runAccountTransaction(account.id, () => {
            this.clearMemoryLedger(account.id);
            this.memory.paperAccountsByUserId.delete(user.id);
            this.memory.paperAccountsById.delete(account.id);
            for (const key of this.memory.retiredClientKeys)
              if (key.startsWith(account.id + ':'))
                this.memory.retiredClientKeys.delete(key);
            return Promise.resolve();
          });
      }
      this.strategies.forgetUser(user.id);
      this.backtests.forgetUser(user.id);
      this.jobs.forgetUser(user.id);
      this.audit.forgetUser(user.id);
      this.watchlists.delete(user.id);
      for (let i = this.archives.length - 1; i >= 0; i--)
        if (this.archives[i].userId === user.id) this.archives.splice(i, 1);
      this.automation.forgetUser(user.id);
      this.auth.forgetUser(user.id);
    } finally {
      this.auth.cancelAccountDeletion(user.id);
    }
  }
  private clearMemoryLedger(accountId: number): void {
    for (const [key, item] of this.memory.positionsByKey)
      if (item.paperAccountId === accountId)
        this.memory.positionsByKey.delete(key);
    for (const [key, item] of this.memory.ordersById)
      if (item.paperAccountId === accountId) this.memory.ordersById.delete(key);
    for (const [key, item] of this.memory.executionsById)
      if (item.paperAccountId === accountId)
        this.memory.executionsById.delete(key);
    for (const key of this.memory.orderIdsByClientKey.keys())
      if (key.startsWith(accountId + ':'))
        this.memory.orderIdsByClientKey.delete(key);
  }
}
