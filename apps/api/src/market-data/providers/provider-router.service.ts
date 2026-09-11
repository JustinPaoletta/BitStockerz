import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { AuditService } from '../../observability/audit.service';
import { MetricsService } from '../../observability/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CircuitBreaker,
  CircuitOpenError,
  isTransientProviderError,
  PermanentProviderError,
  type CircuitState,
} from './circuit-breaker';
import { LiveMarketDataProvider } from './live.provider';
import type {
  MarketDataProvider,
  ProviderDailyBar,
  ProviderHourlyBar,
} from './market-data-provider';
import { SeedMarketDataProvider } from './seed.provider';

export type ProviderFetchSource = 'live' | 'seed' | 'none';

export interface ProviderFetchResult<T> {
  bars: T;
  source: ProviderFetchSource;
  provider: string;
}

export interface ProviderHealthInfo {
  configured: string;
  last_success_at: string | null;
  circuit: CircuitState;
  last_error_code: string | null;
}

type FeedType = 'equity_daily' | 'crypto_daily' | 'crypto_hourly';

@Injectable()
export class ProviderRouterService {
  private readonly logger = new Logger(ProviderRouterService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();
  private lastSuccessAt: string | null = null;
  private lastErrorCode: string | null = null;
  private liveProviderOverride?: MarketDataProvider;

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly seedProvider: SeedMarketDataProvider,
    private readonly liveProvider: LiveMarketDataProvider,
    private readonly metrics: MetricsService,
    private readonly audit: AuditService,
  ) {}

  /** Test helper — inject a fake live adapter without Nest DI changes. */
  setLiveProviderForTests(provider: MarketDataProvider | undefined): void {
    this.liveProviderOverride = provider;
  }

  getHealthInfo(): ProviderHealthInfo {
    const liveEnabled = this.config.marketData.liveEnabled;
    const breaker = this.getBreaker('equity_daily');
    return {
      configured: liveEnabled ? 'live' : 'seed',
      last_success_at: this.lastSuccessAt,
      circuit: liveEnabled ? breaker.getStatus().state : 'closed',
      last_error_code: this.lastErrorCode,
    };
  }

  async fetchEquityDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderFetchResult<ProviderDailyBar[]>> {
    return this.fetch('equity_daily', (provider) =>
      provider.fetchEquityDaily(symbolId, symbol),
    );
  }

  async fetchCryptoDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderFetchResult<ProviderDailyBar[]>> {
    return this.fetch('crypto_daily', (provider) =>
      provider.fetchCryptoDaily(symbolId, symbol),
    );
  }

  async fetchCryptoHourly(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderFetchResult<ProviderHourlyBar[]>> {
    return this.fetch('crypto_hourly', (provider) =>
      provider.fetchCryptoHourly(symbolId, symbol),
    );
  }

  private async fetch<T>(
    feed: FeedType,
    invoke: (provider: MarketDataProvider) => Promise<T>,
  ): Promise<ProviderFetchResult<T>> {
    const liveEnabled = this.config.marketData.liveEnabled;
    const live = this.liveProviderOverride ?? this.liveProvider;

    if (liveEnabled) {
      const breaker = this.getBreaker(feed);
      try {
        const bars = await breaker.exec(() => invoke(live));
        this.lastSuccessAt = new Date().toISOString();
        this.lastErrorCode = null;
        return { bars, source: 'live', provider: live.name };
      } catch (error) {
        this.lastErrorCode = errorCode(error);
        this.metrics.recordError('market_data');
        await this.audit.record({
          eventType: 'market_data.provider_fallback',
          payload: {
            feed,
            live_provider: live.name,
            error_code: this.lastErrorCode,
            transient: isTransientProviderError(error),
          },
        });
        this.logger.warn(
          `Live provider fallback for ${feed}: ${this.lastErrorCode}`,
        );

        if (this.allowSeedFallback()) {
          const bars = await invoke(this.seedProvider);
          return { bars, source: 'seed', provider: this.seedProvider.name };
        }

        return {
          bars: emptyBars<T>(),
          source: 'none',
          provider: live.name,
        };
      }
    }

    const bars = await invoke(this.seedProvider);
    this.lastSuccessAt = new Date().toISOString();
    this.lastErrorCode = null;
    return { bars, source: 'seed', provider: this.seedProvider.name };
  }

  private allowSeedFallback(): boolean {
    // Synthetic seed is only a fallback when Prisma is disabled in
    // development/test. Production with DB retains last-known bars (source none).
    if (this.config.server.nodeEnv === 'production') {
      return false;
    }
    return !this.prisma.isEnabled;
  }

  private getBreaker(feed: FeedType): CircuitBreaker {
    const key = `live:${feed}`;
    let breaker = this.breakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker({
        failureThreshold: this.config.marketData.circuitFailures,
        cooldownMs: this.config.marketData.circuitCooldownMs,
      });
      this.breakers.set(key, breaker);
    }
    return breaker;
  }
}

function errorCode(error: unknown): string {
  if (error instanceof CircuitOpenError) {
    return 'CIRCUIT_OPEN';
  }
  if (error instanceof PermanentProviderError) {
    return 'PROVIDER_NOT_CONFIGURED';
  }
  if (error instanceof Error && error.message) {
    return error.message.slice(0, 120);
  }
  return 'PROVIDER_ERROR';
}

function emptyBars<T>(): T {
  return [] as unknown as T;
}
