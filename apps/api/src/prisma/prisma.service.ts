import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly isEnabled: boolean;
  private readonly client?: PrismaClient;

  constructor(config: AppConfigService) {
    const databaseUrl = config.dependencies.databaseUrl;
    this.isEnabled = Boolean(
      databaseUrl &&
      isMysqlCompatibleUrl(databaseUrl) &&
      config.server.nodeEnv !== 'test',
    );

    if (databaseUrl && this.isEnabled) {
      this.client = new PrismaClient({
        adapter: new PrismaMariaDb(databaseUrl),
      });
    }
  }

  get symbol() {
    return this.requireClient().symbol;
  }

  get equityDailyBar() {
    return this.requireClient().equityDailyBar;
  }

  get cryptoDailyBar() {
    return this.requireClient().cryptoDailyBar;
  }

  get cryptoHourlyBar() {
    return this.requireClient().cryptoHourlyBar;
  }

  get job() {
    return this.requireClient().job;
  }

  get user() {
    return this.requireClient().user;
  }

  get webAuthnCredential() {
    return this.requireClient().webAuthnCredential;
  }

  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
  ): Promise<R> {
    return this.requireClient().$transaction(fn);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
    }
  }

  private requireClient(): PrismaClient {
    if (!this.client) {
      throw new Error(
        'Prisma client is not configured. Set DATABASE_URL to enable database access.',
      );
    }

    return this.client;
  }
}

function isMysqlCompatibleUrl(databaseUrl: string): boolean {
  try {
    const parsed = new URL(databaseUrl);
    return ['mysql:', 'mariadb:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
