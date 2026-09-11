import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  candleCachePrefix,
  TtlCacheService,
} from '../../common/cache/ttl-cache.service';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { AssetType } from '../market-data.types';
import { ProviderRouterService } from '../providers/provider-router.service';
import { CandleSanityService } from '../sanity/candle-sanity.service';
import type {
  SanityBarInput,
  SanitySummary,
} from '../sanity/candle-sanity.types';
import { SEED_SYMBOLS } from '../seed-symbols';

export interface EquityImportOptions {
  symbol?: string;
}

export interface CryptoImportOptions {
  symbol?: string;
  intervals?: Array<'1d' | '1h'>;
}

export interface EquityImportResult {
  symbolsProcessed: number;
  importedBars: number;
  sanity: SanitySummary;
}

export interface CryptoImportResult {
  symbolsProcessed: number;
  importedDailyBars: number;
  importedHourlyBars: number;
  sanity: SanitySummary;
}

@Injectable()
export class MarketDataIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sanity: CandleSanityService,
    private readonly providers: ProviderRouterService,
    private readonly cache: TtlCacheService,
  ) {}

  async importEquityDaily(
    options: EquityImportOptions = {},
  ): Promise<EquityImportResult> {
    const symbols = this.resolveSymbols('EQUITY', options.symbol);
    let importedBars = 0;
    const sanityBars: SanityBarInput[] = [];
    const invalidated = new Set<string>();

    for (const seedSymbol of symbols) {
      const fetched = await this.providers.fetchEquityDaily(
        seedSymbol.id,
        seedSymbol.symbol,
      );
      const bars = fetched.bars;

      for (const bar of bars) {
        sanityBars.push({
          symbol: seedSymbol.symbol,
          interval: '1d',
          date: bar.date.toISOString().slice(0, 10),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        });
      }

      if (this.prisma.isEnabled) {
        const symbolId = await this.ensureSymbol(seedSymbol);
        for (const bar of bars) {
          await this.prisma.equityDailyBar.upsert({
            where: {
              symbolId_date: {
                symbolId,
                date: bar.date,
              },
            },
            create: {
              symbolId,
              date: bar.date,
              open: new Prisma.Decimal(bar.open),
              high: new Prisma.Decimal(bar.high),
              low: new Prisma.Decimal(bar.low),
              close: new Prisma.Decimal(bar.close),
              volume: BigInt(bar.volume),
              provider: bar.provider,
              createdAt: new Date(),
            },
            update: {
              open: new Prisma.Decimal(bar.open),
              high: new Prisma.Decimal(bar.high),
              low: new Prisma.Decimal(bar.low),
              close: new Prisma.Decimal(bar.close),
              volume: BigInt(bar.volume),
              provider: bar.provider,
            },
          });
          importedBars += 1;
        }
        if (bars.length > 0) {
          invalidated.add(seedSymbol.symbol);
        }
      } else {
        importedBars += bars.length;
        if (bars.length > 0) {
          invalidated.add(seedSymbol.symbol);
        }
      }
    }

    for (const symbol of invalidated) {
      this.cache.deleteByPrefix(candleCachePrefix('EQUITY', symbol));
    }

    return {
      symbolsProcessed: symbols.length,
      importedBars,
      sanity: this.sanity.scan(sanityBars),
    };
  }

  async importCrypto(
    options: CryptoImportOptions = {},
  ): Promise<CryptoImportResult> {
    const symbols = this.resolveSymbols('CRYPTO', options.symbol);
    const intervals = options.intervals ?? ['1d', '1h'];
    let importedDailyBars = 0;
    let importedHourlyBars = 0;
    const sanityBars: SanityBarInput[] = [];
    const invalidated = new Set<string>();

    for (const seedSymbol of symbols) {
      if (intervals.includes('1d')) {
        const fetched = await this.providers.fetchCryptoDaily(
          seedSymbol.id,
          seedSymbol.symbol,
        );
        const bars = fetched.bars;

        for (const bar of bars) {
          sanityBars.push({
            symbol: seedSymbol.symbol,
            interval: '1d',
            date: bar.date.toISOString().slice(0, 10),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          });
        }

        if (this.prisma.isEnabled) {
          const symbolId = await this.ensureSymbol(seedSymbol);
          for (const bar of bars) {
            await this.prisma.cryptoDailyBar.upsert({
              where: {
                symbolId_date: {
                  symbolId,
                  date: bar.date,
                },
              },
              create: {
                symbolId,
                date: bar.date,
                open: new Prisma.Decimal(bar.open),
                high: new Prisma.Decimal(bar.high),
                low: new Prisma.Decimal(bar.low),
                close: new Prisma.Decimal(bar.close),
                volume: new Prisma.Decimal(bar.volume),
                provider: bar.provider,
                createdAt: new Date(),
              },
              update: {
                open: new Prisma.Decimal(bar.open),
                high: new Prisma.Decimal(bar.high),
                low: new Prisma.Decimal(bar.low),
                close: new Prisma.Decimal(bar.close),
                volume: new Prisma.Decimal(bar.volume),
                provider: bar.provider,
              },
            });
            importedDailyBars += 1;
          }
        } else {
          importedDailyBars += bars.length;
        }
        if (bars.length > 0) {
          invalidated.add(seedSymbol.symbol);
        }
      }

      if (intervals.includes('1h')) {
        const fetched = await this.providers.fetchCryptoHourly(
          seedSymbol.id,
          seedSymbol.symbol,
        );
        const bars = fetched.bars;

        for (const bar of bars) {
          sanityBars.push({
            symbol: seedSymbol.symbol,
            interval: '1h',
            timestamp: bar.timestamp.toISOString(),
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume,
          });
        }

        if (this.prisma.isEnabled) {
          const symbolId = await this.ensureSymbol(seedSymbol);
          for (const bar of bars) {
            await this.prisma.cryptoHourlyBar.upsert({
              where: {
                symbolId_timestamp: {
                  symbolId,
                  timestamp: bar.timestamp,
                },
              },
              create: {
                symbolId,
                timestamp: bar.timestamp,
                open: new Prisma.Decimal(bar.open),
                high: new Prisma.Decimal(bar.high),
                low: new Prisma.Decimal(bar.low),
                close: new Prisma.Decimal(bar.close),
                volume: new Prisma.Decimal(bar.volume),
                provider: bar.provider,
                createdAt: new Date(),
              },
              update: {
                open: new Prisma.Decimal(bar.open),
                high: new Prisma.Decimal(bar.high),
                low: new Prisma.Decimal(bar.low),
                close: new Prisma.Decimal(bar.close),
                volume: new Prisma.Decimal(bar.volume),
                provider: bar.provider,
              },
            });
            importedHourlyBars += 1;
          }
        } else {
          importedHourlyBars += bars.length;
        }
        if (bars.length > 0) {
          invalidated.add(seedSymbol.symbol);
        }
      }
    }

    for (const symbol of invalidated) {
      this.cache.deleteByPrefix(candleCachePrefix('CRYPTO', symbol));
    }

    return {
      symbolsProcessed: symbols.length,
      importedDailyBars,
      importedHourlyBars,
      sanity: this.sanity.scan(sanityBars),
    };
  }

  private resolveSymbols(assetType: AssetType, symbol?: string) {
    const active = SEED_SYMBOLS.filter(
      (record) => record.isActive && record.assetType === assetType,
    );

    if (!symbol) {
      return active;
    }

    const normalized = symbol.trim().toUpperCase();
    const match = active.find((record) => record.symbol === normalized);
    if (!match) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Symbol ${normalized} was not found.`,
      );
    }

    return [match];
  }

  private async ensureSymbol(seedSymbol: (typeof SEED_SYMBOLS)[number]) {
    const now = new Date();
    const record = await this.prisma.symbol.upsert({
      where: { symbol: seedSymbol.symbol },
      create: {
        symbol: seedSymbol.symbol,
        name: seedSymbol.name,
        assetType: seedSymbol.assetType,
        exchange: seedSymbol.exchange ?? null,
        currency: seedSymbol.currency,
        baseAsset: seedSymbol.baseAsset ?? null,
        quoteAsset: seedSymbol.quoteAsset ?? null,
        isActive: seedSymbol.isActive,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        name: seedSymbol.name,
        assetType: seedSymbol.assetType,
        exchange: seedSymbol.exchange ?? null,
        currency: seedSymbol.currency,
        baseAsset: seedSymbol.baseAsset ?? null,
        quoteAsset: seedSymbol.quoteAsset ?? null,
        isActive: seedSymbol.isActive,
        updatedAt: now,
      },
    });

    return record.id;
  }
}
