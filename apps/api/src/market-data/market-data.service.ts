import { Injectable } from '@nestjs/common';
import type { Symbol as PrismaSymbol } from '@prisma/client';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssetType,
  CandleOrder,
  CryptoCandleResponse,
  CryptoCandlesInput,
  CryptoDailyCandleResponse,
  CryptoHourlyCandleResponse,
  EquityCandlesInput,
  EquityDailyCandleResponse,
  SymbolRecord,
  SymbolResponse,
  SymbolSearchInput,
} from './market-data.types';
import {
  SEED_CRYPTO_DAILY_BARS,
  SEED_CRYPTO_HOURLY_BARS,
  SEED_EQUITY_DAILY_BARS,
} from './seed-candles';
import { SEED_SYMBOLS } from './seed-symbols';

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 100;
const DEFAULT_CANDLE_ORDER: CandleOrder = 'asc';
const MAX_CANDLE_LIMIT = 5000;
const DEFAULT_CANDLE_LIMIT = MAX_CANDLE_LIMIT;

type NumericValue = number | bigint | { toString(): string };

interface DailyBarLike {
  date: Date;
  open: NumericValue;
  high: NumericValue;
  low: NumericValue;
  close: NumericValue;
  volume: NumericValue;
}

interface HourlyBarLike {
  timestamp: Date;
  open: NumericValue;
  high: NumericValue;
  low: NumericValue;
  close: NumericValue;
  volume: NumericValue;
}

interface ParsedCandleRange {
  start: Date;
  end: Date;
  limit: number;
  order: CandleOrder;
}

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

  async getEquityDailyCandles(
    input: EquityCandlesInput,
  ): Promise<EquityDailyCandleResponse[]> {
    const range = parseCandleRange(input, 'daily');
    const symbol = await this.resolveActiveSymbol(input.symbol, 'EQUITY');

    if (this.prisma.isEnabled) {
      const records = await this.prisma.equityDailyBar.findMany({
        where: {
          symbolId: symbol.id,
          date: { gte: range.start, lte: range.end },
        },
        orderBy: { date: range.order },
        take: range.limit,
      });

      return records.map(toDailyCandleResponse);
    }

    return selectSeedBars(SEED_EQUITY_DAILY_BARS, symbol.id, 'date', range).map(
      toDailyCandleResponse,
    );
  }

  async getCryptoCandles(
    input: CryptoCandlesInput,
  ): Promise<CryptoCandleResponse[]> {
    if (input.interval !== '1d' && input.interval !== '1h') {
      throw validationError(
        'interval',
        'interval must be one of the following values: 1d, 1h',
      );
    }

    const range = parseCandleRange(
      input,
      input.interval === '1d' ? 'daily' : 'hourly',
    );
    const symbol = await this.resolveActiveSymbol(input.symbol, 'CRYPTO');

    if (input.interval === '1d') {
      if (this.prisma.isEnabled) {
        const records = await this.prisma.cryptoDailyBar.findMany({
          where: {
            symbolId: symbol.id,
            date: { gte: range.start, lte: range.end },
          },
          orderBy: { date: range.order },
          take: range.limit,
        });

        return records.map(toDailyCandleResponse);
      }

      return selectSeedBars(
        SEED_CRYPTO_DAILY_BARS,
        symbol.id,
        'date',
        range,
      ).map(toDailyCandleResponse);
    }

    if (this.prisma.isEnabled) {
      const records = await this.prisma.cryptoHourlyBar.findMany({
        where: {
          symbolId: symbol.id,
          timestamp: { gte: range.start, lte: range.end },
        },
        orderBy: { timestamp: range.order },
        take: range.limit,
      });

      return records.map(toHourlyCandleResponse);
    }

    return selectSeedBars(
      SEED_CRYPTO_HOURLY_BARS,
      symbol.id,
      'timestamp',
      range,
    ).map(toHourlyCandleResponse);
  }

  private async resolveActiveSymbol(
    rawSymbol: string,
    expectedAssetType: AssetType,
  ): Promise<SymbolResponse> {
    if (!rawSymbol?.trim()) {
      throw validationError('symbol', 'symbol must not be empty');
    }

    const symbol = await this.lookupSymbol(rawSymbol);
    if (symbol.asset_type !== expectedAssetType) {
      throw validationError(
        'asset_type',
        `Symbol ${symbol.symbol} has asset_type ${symbol.asset_type}; expected ${expectedAssetType}.`,
      );
    }

    return symbol;
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

function parseCandleRange(
  input: Pick<EquityCandlesInput, 'start' | 'end' | 'limit' | 'order'>,
  kind: 'daily' | 'hourly',
): ParsedCandleRange {
  const parseDate = kind === 'daily' ? parseDailyDate : parseHourlyDate;
  const start = parseDate(input.start, 'start');
  const end = parseDate(input.end, 'end');

  if (start.getTime() > end.getTime()) {
    throw validationError('end', 'end must be greater than or equal to start');
  }

  const order = input.order ?? DEFAULT_CANDLE_ORDER;
  if (order !== 'asc' && order !== 'desc') {
    throw validationError(
      'order',
      'order must be one of the following values: asc, desc',
    );
  }

  const limit = input.limit ?? DEFAULT_CANDLE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CANDLE_LIMIT) {
    throw validationError(
      'limit',
      `limit must be an integer between 1 and ${MAX_CANDLE_LIMIT}`,
    );
  }

  return { start, end, limit, order };
}

function parseDailyDate(value: string, field: 'start' | 'end'): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError(field, `${field} must use YYYY-MM-DD format`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw validationError(field, `${field} must be a valid calendar date`);
  }

  return date;
}

function parseHourlyDate(value: string, field: 'start' | 'end'): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );

  if (!match || !hasValidIsoDateTimeParts(match)) {
    throw validationError(
      field,
      `${field} must be an ISO 8601 datetime with a UTC offset`,
    );
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw validationError(field, `${field} must be a valid ISO 8601 datetime`);
  }

  return date;
}

function hasValidIsoDateTimeParts(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const zone = match[7];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }

  if (zone !== 'Z') {
    const [zoneHour, zoneMinute] = zone.slice(1).split(':').map(Number);
    if (zoneHour > 23 || zoneMinute > 59) {
      return false;
    }
  }

  return true;
}

function validationError(field: string, reason: string): DomainError {
  return new DomainError(ErrorCode.VALIDATION_ERROR, reason, undefined, [
    { field, reason },
  ]);
}

function selectSeedBars<T extends { symbolId: number }>(
  records: T[],
  symbolId: number,
  timeField: T extends HourlyBarLike ? 'timestamp' : 'date',
  range: ParsedCandleRange,
): T[] {
  const selected = records
    .filter((record) => {
      const time = (record[timeField as keyof T] as Date).getTime();
      return (
        record.symbolId === symbolId &&
        time >= range.start.getTime() &&
        time <= range.end.getTime()
      );
    })
    .sort((left, right) => {
      const leftTime = (left[timeField as keyof T] as Date).getTime();
      const rightTime = (right[timeField as keyof T] as Date).getTime();
      return leftTime - rightTime;
    });

  if (range.order === 'desc') {
    selected.reverse();
  }

  return selected.slice(0, range.limit);
}

function toDailyCandleResponse(
  record: DailyBarLike,
): CryptoDailyCandleResponse {
  return {
    date: record.date.toISOString().slice(0, 10),
    open: toNumber(record.open),
    high: toNumber(record.high),
    low: toNumber(record.low),
    close: toNumber(record.close),
    volume: toNumber(record.volume),
  };
}

function toHourlyCandleResponse(
  record: HourlyBarLike,
): CryptoHourlyCandleResponse {
  return {
    timestamp: record.timestamp.toISOString(),
    open: toNumber(record.open),
    high: toNumber(record.high),
    low: toNumber(record.low),
    close: toNumber(record.close),
    volume: toNumber(record.volume),
  };
}

function toNumber(value: NumericValue): number {
  return typeof value === 'object' ? Number(value.toString()) : Number(value);
}
