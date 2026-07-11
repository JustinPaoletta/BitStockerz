import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from '../../common/errors/domain-error';
import { ErrorCode } from '../../common/errors/error-codes.enum';
import { PrismaService } from '../../prisma/prisma.service';
import type { AssetType } from '../market-data.types';
import {
  SEED_CRYPTO_DAILY_BARS,
  SEED_CRYPTO_HOURLY_BARS,
  SEED_EQUITY_DAILY_BARS,
} from '../seed-candles';
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
}

export interface CryptoImportResult {
  symbolsProcessed: number;
  importedDailyBars: number;
  importedHourlyBars: number;
}

@Injectable()
export class MarketDataIngestionService {
  constructor(private readonly prisma: PrismaService) {}

  async importEquityDaily(
    options: EquityImportOptions = {},
  ): Promise<EquityImportResult> {
    const symbols = this.resolveSymbols('EQUITY', options.symbol);
    let importedBars = 0;

    for (const seedSymbol of symbols) {
      const bars = SEED_EQUITY_DAILY_BARS.filter(
        (bar) => bar.symbolId === seedSymbol.id,
      );

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
      } else {
        importedBars += bars.length;
      }
    }

    return { symbolsProcessed: symbols.length, importedBars };
  }

  async importCrypto(
    options: CryptoImportOptions = {},
  ): Promise<CryptoImportResult> {
    const symbols = this.resolveSymbols('CRYPTO', options.symbol);
    const intervals = options.intervals ?? ['1d', '1h'];
    let importedDailyBars = 0;
    let importedHourlyBars = 0;

    for (const seedSymbol of symbols) {
      if (intervals.includes('1d')) {
        const bars = SEED_CRYPTO_DAILY_BARS.filter(
          (bar) => bar.symbolId === seedSymbol.id,
        );

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
      }

      if (intervals.includes('1h')) {
        const bars = SEED_CRYPTO_HOURLY_BARS.filter(
          (bar) => bar.symbolId === seedSymbol.id,
        );

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
      }
    }

    return {
      symbolsProcessed: symbols.length,
      importedDailyBars,
      importedHourlyBars,
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
