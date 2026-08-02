import type {
  CryptoDailyBarRecord,
  CryptoHourlyBarRecord,
  EquityDailyBarRecord,
} from './market-data.types';

const SEED_PROVIDER = 'seed';
const EQUITY_BAR_COUNT = 40;
const CRYPTO_DAILY_BAR_COUNT = 30;
const CRYPTO_HOURLY_BAR_COUNT = 48;

/** Seed OHLCV ends at "today" (UTC) so local health demos can report fresh. */
const SEED_ANCHOR = new Date();

export const SEED_EQUITY_DAILY_BARS: EquityDailyBarRecord[] = [
  ...buildEquityDailyBars(1, 185, 52_000_000),
  ...buildEquityDailyBars(2, 410, 24_000_000),
  ...buildEquityDailyBars(3, 590, 68_000_000),
];

export const SEED_CRYPTO_DAILY_BARS: CryptoDailyBarRecord[] = [
  ...buildCryptoDailyBars(4, 94_000, 18_500),
  ...buildCryptoDailyBars(5, 3_300, 265_000),
];

export const SEED_CRYPTO_HOURLY_BARS: CryptoHourlyBarRecord[] = [
  ...buildCryptoHourlyBars(4, 96_000, 825),
  ...buildCryptoHourlyBars(5, 3_450, 12_500),
];

/** First five AAPL weekday dates (ascending) for sample queries. */
export const SEED_EQUITY_SAMPLE = sampleEquityDates(1, 5);

/** First three BTC-USD daily dates (ascending) for sample queries. */
export const SEED_CRYPTO_DAILY_SAMPLE = sampleCryptoDailyDates(4, 3);

/** First three BTC-USD hourly timestamps (ascending) for sample queries. */
export const SEED_CRYPTO_HOURLY_SAMPLE = sampleCryptoHourlyTimestamps(4, 3);

function buildEquityDailyBars(
  symbolId: number,
  basePrice: number,
  baseVolume: number,
): EquityDailyBarRecord[] {
  const bars: EquityDailyBarRecord[] = [];
  const cursor = weekdayStartForCount(
    startOfUtcDay(SEED_ANCHOR),
    EQUITY_BAR_COUNT,
  );

  while (bars.length < EQUITY_BAR_COUNT) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      const index = bars.length;
      const open = basePrice + index * 0.35 + ((index % 5) - 2) * 0.45;
      const close = open + ((index % 4) - 1.5) * 0.3;

      bars.push({
        symbolId,
        date: new Date(cursor),
        open: round(open, 6),
        high: round(Math.max(open, close) + 1.1 + (index % 3) * 0.15, 6),
        low: round(Math.min(open, close) - 0.9 - (index % 2) * 0.2, 6),
        close: round(close, 6),
        volume: baseVolume + index * 125_000 + (index % 7) * 50_000,
        provider: SEED_PROVIDER,
      });
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return bars;
}

function buildCryptoDailyBars(
  symbolId: number,
  basePrice: number,
  baseVolume: number,
): CryptoDailyBarRecord[] {
  const end = startOfUtcDay(SEED_ANCHOR);
  const start = addUtcDays(end, -(CRYPTO_DAILY_BAR_COUNT - 1));

  return Array.from({ length: CRYPTO_DAILY_BAR_COUNT }, (_, index) => {
    const date = addUtcDays(start, index);
    const scale = basePrice >= 10_000 ? 1 : 0.04;
    const open =
      basePrice + index * basePrice * 0.0015 + ((index % 6) - 2.5) * 85 * scale;
    const close = open + ((index % 5) - 2) * 70 * scale;

    return {
      symbolId,
      date,
      open: round(open, 6),
      high: round(Math.max(open, close) + 240 * scale, 6),
      low: round(Math.min(open, close) - 210 * scale, 6),
      close: round(close, 6),
      volume: round(baseVolume + index * baseVolume * 0.006, 8),
      provider: SEED_PROVIDER,
    };
  });
}

function buildCryptoHourlyBars(
  symbolId: number,
  basePrice: number,
  baseVolume: number,
): CryptoHourlyBarRecord[] {
  const end = startOfUtcHour(SEED_ANCHOR);
  const start = new Date(end);
  start.setUTCHours(start.getUTCHours() - (CRYPTO_HOURLY_BAR_COUNT - 1));

  return Array.from({ length: CRYPTO_HOURLY_BAR_COUNT }, (_, index) => {
    const timestamp = new Date(start);
    timestamp.setUTCHours(timestamp.getUTCHours() + index);
    const scale = basePrice >= 10_000 ? 1 : 0.04;
    const open =
      basePrice + index * 18 * scale + ((index % 8) - 3.5) * 22 * scale;
    const close = open + ((index % 5) - 2) * 14 * scale;

    return {
      symbolId,
      timestamp,
      open: round(open, 6),
      high: round(Math.max(open, close) + 48 * scale, 6),
      low: round(Math.min(open, close) - 42 * scale, 6),
      close: round(close, 6),
      volume: round(baseVolume + (index % 12) * baseVolume * 0.0125, 8),
      provider: SEED_PROVIDER,
    };
  });
}

function sampleEquityDates(symbolId: number, count: number) {
  const dates = SEED_EQUITY_DAILY_BARS.filter(
    (bar) => bar.symbolId === symbolId,
  )
    .slice(0, count)
    .map((bar) => dateOnly(bar.date));

  return {
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
  };
}

function sampleCryptoDailyDates(symbolId: number, count: number) {
  const dates = SEED_CRYPTO_DAILY_BARS.filter(
    (bar) => bar.symbolId === symbolId,
  )
    .slice(0, count)
    .map((bar) => dateOnly(bar.date));

  return {
    start: dates[0],
    end: dates[dates.length - 1],
    dates,
  };
}

function sampleCryptoHourlyTimestamps(symbolId: number, count: number) {
  const timestamps = SEED_CRYPTO_HOURLY_BARS.filter(
    (bar) => bar.symbolId === symbolId,
  )
    .slice(0, count)
    .map((bar) => bar.timestamp.toISOString());

  return {
    start: timestamps[0],
    end: timestamps[timestamps.length - 1],
    timestamps,
  };
}

function weekdayStartForCount(endInclusive: Date, count: number): Date {
  let remaining = count;
  const cursor = new Date(endInclusive);

  while (remaining > 0) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      remaining -= 1;
      if (remaining === 0) {
        break;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return cursor;
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function startOfUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    ),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}
