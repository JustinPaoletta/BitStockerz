import { Injectable } from '@nestjs/common';
import type { Symbol as PrismaSymbol } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssetType,
  SymbolRecord,
  SymbolResponse,
  SymbolSearchInput,
} from './market-data.types';
import { SEED_SYMBOLS } from './seed-symbols';

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;

@Injectable()
export class MarketDataService {
  constructor(private readonly prisma: PrismaService) {}

  async lookupSymbol(symbol: string): Promise<SymbolResponse> {
    const normalizedSymbol = normalizeSymbol(symbol);
    const record = this.prisma.isEnabled
      ? await this.lookupSymbolFromDatabase(normalizedSymbol)
      : this.lookupSymbolFromSeed(normalizedSymbol);

    if (!record) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Symbol ${normalizedSymbol} was not found.`,
      );
    }

    return toSymbolResponse(record);
  }

  async searchSymbols(input: SymbolSearchInput): Promise<SymbolResponse[]> {
    const query = input.q?.trim() ?? '';
    const limit = clampLimit(input.limit);

    const records = this.prisma.isEnabled
      ? await this.searchSymbolsFromDatabase(query, input.assetType, limit)
      : this.searchSymbolsFromSeed(query, input.assetType, limit);

    return records.map(toSymbolResponse);
  }

  private async lookupSymbolFromDatabase(
    symbol: string,
  ): Promise<SymbolRecord | undefined> {
    const record = await this.prisma.symbol.findUnique({
      where: {
        symbol,
      },
    });

    if (!record || !record.isActive) {
      return undefined;
    }

    return fromPrismaSymbol(record);
  }

  private lookupSymbolFromSeed(symbol: string): SymbolRecord | undefined {
    return SEED_SYMBOLS.find(
      (record) => record.isActive && record.symbol === symbol,
    );
  }

  private async searchSymbolsFromDatabase(
    query: string,
    assetType: AssetType | undefined,
    limit: number,
  ): Promise<SymbolRecord[]> {
    const records = await this.prisma.symbol.findMany({
      where: {
        isActive: true,
        ...(assetType ? { assetType } : {}),
        ...(query
          ? {
              OR: [
                { symbol: { contains: query } },
                { name: { contains: query } },
                { baseAsset: { contains: query } },
                { quoteAsset: { contains: query } },
              ],
            }
          : {}),
      },
      orderBy: [{ symbol: 'asc' }],
      take: limit,
    });

    return records.map(fromPrismaSymbol);
  }

  private searchSymbolsFromSeed(
    query: string,
    assetType: AssetType | undefined,
    limit: number,
  ): SymbolRecord[] {
    const normalizedQuery = query.toLowerCase();

    return SEED_SYMBOLS.filter((record) => {
      if (!record.isActive) {
        return false;
      }

      if (assetType && record.assetType !== assetType) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [
        record.symbol,
        record.name,
        record.baseAsset,
        record.quoteAsset,
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    })
      .sort((left, right) => left.symbol.localeCompare(right.symbol))
      .slice(0, limit);
  }
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_SEARCH_LIMIT;
  }

  return Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT);
}

function fromPrismaSymbol(record: PrismaSymbol): SymbolRecord {
  return {
    id: record.id,
    symbol: record.symbol,
    name: record.name,
    assetType: record.assetType as AssetType,
    exchange: record.exchange ?? undefined,
    currency: record.currency,
    baseAsset: record.baseAsset ?? undefined,
    quoteAsset: record.quoteAsset ?? undefined,
    isActive: record.isActive,
  };
}

function toSymbolResponse(record: SymbolRecord): SymbolResponse {
  return {
    id: record.id,
    symbol: record.symbol,
    name: record.name,
    asset_type: record.assetType,
    exchange: record.exchange,
    currency: record.currency,
    base_asset: record.baseAsset,
    quote_asset: record.quoteAsset,
    is_active: record.isActive,
  };
}
