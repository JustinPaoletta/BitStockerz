import type {
  CryptoDailyBarRecord,
  CryptoHourlyBarRecord,
  EquityDailyBarRecord,
} from './market-data.types';

const SEED_PROVIDER = 'seed';
const EQUITY_BAR_COUNT = 40;
const CRYPTO_DAILY_BAR_COUNT = 30;
const CRYPTO_HOURLY_BAR_COUNT = 48;

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

function buildEquityDailyBars(
  symbolId: number,
  basePrice: number,
  baseVolume: number,
): EquityDailyBarRecord[] {
  const bars: EquityDailyBarRecord[] = [];
  const cursor = new Date('2026-01-05T00:00:00.000Z');

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
  return Array.from({ length: CRYPTO_DAILY_BAR_COUNT }, (_, index) => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + index);
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
  return Array.from({ length: CRYPTO_HOURLY_BAR_COUNT }, (_, index) => {
    const timestamp = new Date('2026-01-15T00:00:00.000Z');
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

function round(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}
