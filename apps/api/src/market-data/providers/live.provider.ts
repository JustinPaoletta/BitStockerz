import { Injectable, Optional } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PermanentProviderError } from './circuit-breaker';
import type {
  MarketDataProvider,
  ProviderDailyBar,
  ProviderHourlyBar,
} from './market-data-provider';

type VendorBar = {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};
const DAY_MS = 86400000;

/** Alpaca historical bars; fixed vendor URLs, bounded requests, completed bars only. */
@Injectable()
export class LiveMarketDataProvider implements MarketDataProvider {
  readonly name = 'live';
  constructor(
    @Optional() private readonly config?: AppConfigService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}
  async fetchEquityDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    return this.daily(await this.fetchBars(symbol, 'EQUITY', '1d'), symbolId);
  }
  async fetchCryptoDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    return this.daily(await this.fetchBars(symbol, 'CRYPTO', '1d'), symbolId);
  }
  async fetchCryptoHourly(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderHourlyBar[]> {
    return (await this.fetchBars(symbol, 'CRYPTO', '1h')).map((bar) => ({
      timestamp: new Date(bar.t),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      provider: 'alpaca',
      symbolId,
    }));
  }
  private daily(bars: VendorBar[], symbolId: number): ProviderDailyBar[] {
    return bars.map((bar) => ({
      date: new Date(bar.t.slice(0, 10) + 'T00:00:00.000Z'),
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
      provider: 'alpaca',
      symbolId,
    }));
  }
  private async fetchBars(
    symbol: string,
    asset: 'EQUITY' | 'CRYPTO',
    interval: '1d' | '1h',
  ): Promise<VendorBar[]> {
    const credentials = this.config?.vendor;
    if (!credentials?.key || !credentials.secret)
      throw new PermanentProviderError(
        'live provider is not configured; set ALPACA_API_KEY and ALPACA_SECRET_KEY',
      );
    const intervalMs = interval === '1h' ? 3600000 : DAY_MS;
    const now = Date.now();
    const end =
      interval === '1d'
        ? Math.floor(now / DAY_MS) * DAY_MS - 1
        : Math.floor(now / intervalMs) * intervalMs - 1;
    let start = end - (interval === '1h' ? 90 : 365 * 5) * DAY_MS;
    if (this.prisma?.isEnabled) {
      const where = { symbol: { symbol } };
      const latest =
        asset === 'EQUITY'
          ? await this.prisma.equityDailyBar.findFirst({
              where,
              orderBy: { date: 'desc' },
            })
          : interval === '1d'
            ? await this.prisma.cryptoDailyBar.findFirst({
                where,
                orderBy: { date: 'desc' },
              })
            : await this.prisma.cryptoHourlyBar.findFirst({
                where,
                orderBy: { timestamp: 'desc' },
              });
      if (latest) {
        const timestamp =
          'timestamp' in latest ? latest.timestamp : latest.date;
        if (asset !== 'EQUITY')
          start = Math.max(start, timestamp.getTime() - intervalMs * 2);
      }
    }
    const vendorSymbol = asset === 'CRYPTO' ? symbol.replace('-', '/') : symbol;
    const url = new URL(
      asset === 'EQUITY'
        ? 'https://data.alpaca.markets/v2/stocks/bars'
        : 'https://data.alpaca.markets/v1beta3/crypto/us/bars',
    );
    for (const [key, value] of Object.entries({
      symbols: vendorSymbol,
      timeframe: interval === '1h' ? '1Hour' : '1Day',
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      limit: '10000',
      sort: 'asc',
    }))
      url.searchParams.set(key, value);
    if (asset === 'EQUITY') {
      url.searchParams.set('feed', credentials.feed);
      url.searchParams.set('adjustment', 'all');
    }
    const bars: VendorBar[] = [];
    const tokens = new Set<string>();
    const deadline = Date.now() + 20000;
    for (let page = 0; page < 5; page++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Market-data request timeout');
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': credentials.key,
            'APCA-API-SECRET-KEY': credentials.secret,
          },
          signal: AbortSignal.timeout(Math.min(remaining, 10000)),
          redirect: 'error',
        });
      } catch {
        throw new Error('Market-data network request failed or timed out');
      }
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        )
          throw new PermanentProviderError(
            `Market-data HTTP ${response.status}`,
          );
        throw new Error(`Market-data HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        bars?: Record<string, unknown[]>;
        next_page_token?: unknown;
      };
      const values = body?.bars?.[vendorSymbol];
      if (!Array.isArray(values))
        throw new PermanentProviderError('Invalid market-data response');
      for (const value of values) {
        const bar = value as VendorBar;
        const ts = new Date(bar?.t).getTime();
        if (
          !Number.isFinite(ts) ||
          [bar?.o, bar?.h, bar?.l, bar?.c, bar?.v].some(
            (item) => typeof item !== 'number' || !Number.isFinite(item),
          ) ||
          Math.min(bar.o, bar.h, bar.l, bar.c) <= 0 ||
          bar.v < 0 ||
          bar.h < Math.max(bar.o, bar.c) ||
          bar.l > Math.min(bar.o, bar.c) ||
          (asset === 'EQUITY' && !Number.isSafeInteger(bar.v))
        )
          throw new PermanentProviderError('Invalid market-data bar');
        if (ts < start || ts > end || ts + intervalMs > now) continue;
        if (interval === '1h' && ts % intervalMs !== 0)
          throw new PermanentProviderError('Invalid hourly timestamp');
        bars.push(bar);
      }
      if (!body.next_page_token)
        return bars
          .sort((a, b) => a.t.localeCompare(b.t))
          .filter((bar, index, all) => !index || bar.t !== all[index - 1].t);
      if (
        typeof body.next_page_token !== 'string' ||
        tokens.has(body.next_page_token)
      )
        throw new PermanentProviderError('Invalid market-data pagination');
      tokens.add(body.next_page_token);
      url.searchParams.set('page_token', body.next_page_token);
    }
    throw new Error('Market-data pagination limit exceeded');
  }
}
