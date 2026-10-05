import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../package.json', import.meta.url));
const { z } = require('zod');
const bar = z
  .object({
    timestamp: z.string().datetime({ offset: true }),
    open: z.number().positive().max(1e12),
    high: z.number().positive().max(1e12),
    low: z.number().positive().max(1e12),
    close: z.number().positive().max(1e12),
    volume: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const schema = z
  .object({
    provider: z.string().min(1).max(64),
    license_reference: z.string().min(1).max(500),
    series: z
      .array(
        z
          .object({
            symbol: z.string().regex(/^[A-Z0-9.-]{1,32}$/),
            name: z.string().min(1).max(255),
            asset_type: z.enum(['EQUITY', 'CRYPTO']),
            timeframe: z.enum(['1d', '1h']),
            bars: z.array(bar).min(1).max(10000),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export function validateImport(value, now = Date.now()) {
  const input = schema.parse(value);
  const seriesKeys = new Set();
  let count = 0;
  const symbolAssets = new Map();
  for (const series of input.series) {
    if (
      series.asset_type === 'CRYPTO' &&
      !/^[A-Z0-9]+-USD$/.test(series.symbol)
    )
      throw new Error(
        'Crypto imports require USD pairs using BASE-USD symbols',
      );
    if (
      symbolAssets.has(series.symbol) &&
      symbolAssets.get(series.symbol) !== series.asset_type
    )
      throw new Error('Conflicting symbol asset types');
    symbolAssets.set(series.symbol, series.asset_type);
    const key = `${series.symbol}:${series.timeframe}`;
    if (seriesKeys.has(key)) throw new Error('Duplicate series');
    seriesKeys.add(key);
    if (series.asset_type === 'EQUITY' && series.timeframe !== '1d')
      throw new Error('Equities require daily bars');
    let previous = -Infinity;
    for (const item of series.bars) {
      const ts = Date.parse(item.timestamp);
      const interval = series.timeframe === '1h' ? 3600000 : 86400000;
      if (ts <= previous || ts % interval !== 0 || ts + interval > now)
        throw new Error(
          'Bars must be ordered, unique, aligned UTC timestamps for completed intervals',
        );
      if (
        item.high < Math.max(item.open, item.close) ||
        item.low > Math.min(item.open, item.close)
      )
        throw new Error('Invalid OHLC bounds');
      if (series.asset_type === 'EQUITY' && !Number.isSafeInteger(item.volume))
        throw new Error('Equity volume must be a safe integer');
      previous = ts;
      count++;
    }
  }
  if (count > 100000) throw new Error('Import exceeds 100000-bar limit');
  return input;
}

export async function importData(input, client) {
  const count = input.series.reduce(
    (sum, series) => sum + series.bars.length,
    0,
  );
  await client.$transaction(
    async (tx) => {
      for (const series of input.series) {
        const existing = await tx.symbol.findUnique({
          where: { symbol: series.symbol },
        });
        if (
          existing &&
          (existing.assetType !== series.asset_type ||
            existing.currency !== 'USD')
        )
          throw new Error('Existing symbol metadata does not match import');
        const symbol = await tx.symbol.upsert({
          where: { symbol: series.symbol },
          create: {
            symbol: series.symbol,
            name: series.name,
            assetType: series.asset_type,
            currency: 'USD',
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...(series.asset_type === 'CRYPTO'
              ? { baseAsset: series.symbol.slice(0, -4), quoteAsset: 'USD' }
              : {}),
          },
          update: {},
        });
        for (const item of series.bars) {
          const timestamp = new Date(item.timestamp);
          const values = {
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume:
              series.asset_type === 'EQUITY'
                ? BigInt(item.volume)
                : item.volume,
            provider: input.provider,
          };
          const table =
            series.asset_type === 'EQUITY'
              ? tx.equityDailyBar
              : series.timeframe === '1d'
                ? tx.cryptoDailyBar
                : tx.cryptoHourlyBar;
          const key =
            series.timeframe === '1h'
              ? { symbolId_timestamp: { symbolId: symbol.id, timestamp } }
              : { symbolId_date: { symbolId: symbol.id, date: timestamp } };
          await table.upsert({
            where: key,
            create: {
              symbolId: symbol.id,
              ...values,
              ...(series.timeframe === '1h'
                ? { timestamp }
                : { date: timestamp }),
              createdAt: new Date(),
            },
            update: values,
          });
        }
      }
      await tx.auditEvent.create({
        data: {
          eventType: 'market_data.operator_import',
          payloadJson: {
            provider: input.provider,
            license_reference: input.license_reference,
            series_count: input.series.length,
            bar_count: count,
          },
          createdAt: new Date(),
        },
      });
    },
    { timeout: 120000 },
  );
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((arg) => !arg.startsWith('--'));
  if (
    !file ||
    args.some((arg) => arg.startsWith('--') && arg !== '--validate-only')
  )
    throw new Error(
      'Usage: node tools/import-market-data.mjs INPUT.json [--validate-only]',
    );
  if ((await stat(file)).size > 30 * 1024 * 1024)
    throw new Error('Input exceeds 30 MiB limit');
  const input = validateImport(JSON.parse(await readFile(file, 'utf8')));
  const count = input.series.reduce(
    (sum, series) => sum + series.bars.length,
    0,
  );
  if (args.includes('--validate-only')) {
    console.log(
      `Validated ${input.series.length} series and ${count} completed bars.`,
    );
    return;
  }
  require('dotenv').config({
    path: fileURLToPath(new URL('../.env', import.meta.url)),
    quiet: true,
  });
  if (!process.env.DATABASE_URL)
    throw new Error('DATABASE_URL is required for import');
  const { PrismaClient } = require('@prisma/client');
  const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
  const client = new PrismaClient({
    adapter: new PrismaMariaDb(process.env.DATABASE_URL),
  });
  try {
    await importData(input, client);
    console.log(
      `Imported ${input.series.length} series and ${count} bars. Restart the API to clear process-local candle caches.`,
    );
  } finally {
    await client.$disconnect();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(
      error instanceof z.ZodError
        ? 'Import validation failed: invalid input structure.'
        : error.message?.startsWith('Usage:')
          ? error.message
          : `Import failed (${error.name ?? 'Error'}). Check input validation or database configuration; no credentials are logged.`,
    );
    process.exitCode = 1;
  });
