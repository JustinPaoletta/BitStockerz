import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, importData } from './import-market-data.mjs';
const input = () => ({
  provider: 'fixture',
  license_reference: 'local test only',
  series: [
    {
      symbol: 'TEST',
      name: 'Test',
      asset_type: 'EQUITY',
      timeframe: '1d',
      bars: [
        {
          timestamp: '2026-01-01T00:00:00Z',
          open: 100,
          high: 110,
          low: 90,
          close: 105,
          volume: 10,
        },
      ],
    },
  ],
});
test('validates completed licensed data without touching a database', () =>
  assert.equal(
    validateImport(input(), Date.parse('2026-01-03')).series.length,
    1,
  ));
test('rejects malformed, incomplete, duplicate, unordered and unlicensed data', () => {
  const variants = [];
  for (const mutate of [
    (x) => (x.license_reference = ''),
    (x) => (x.series[0].bars[0].high = 80),
    (x) => (x.series[0].bars[0].low = 120),
    (x) => (x.series[0].bars[0].volume = 1.5),
    (x) => (x.series[0].timeframe = '1h'),
    (x) => (x.series[0].bars[0].timestamp = '2026-01-01T01:00:00Z'),
    (x) => x.series.push(structuredClone(x.series[0])),
    (x) => x.series[0].bars.push(structuredClone(x.series[0].bars[0])),
  ]) {
    const v = input();
    mutate(v);
    variants.push(v);
  }
  for (const v of variants)
    assert.throws(() => validateImport(v, Date.parse('2026-01-03')));
  assert.throws(() =>
    validateImport(input(), Date.parse('2026-01-01T12:00:00Z')),
  );
});

test('writes required symbol timestamps and bars in the same audited transaction', async () => {
  const calls = [];
  const tx = {
    symbol: {
      findUnique: async () => null,
      upsert: async (args) => {
        calls.push(args);
        assert.ok(args.create.createdAt instanceof Date);
        assert.ok(args.create.updatedAt instanceof Date);
        return { id: 123 };
      },
    },
    equityDailyBar: { upsert: async (args) => calls.push(args) },
    auditEvent: { create: async (args) => calls.push(args) },
  };
  const client = {
    $transaction: async (fn, options) => {
      assert.equal(options.timeout, 120000);
      await fn(tx);
    },
  };
  await importData(validateImport(input(), Date.parse('2026-01-03')), client);
  assert.equal(calls.length, 3);
  assert.equal(calls[1].create.volume, 10n);
  assert.equal(calls[1].create.symbolId, 123);
  assert.equal(calls[2].data.payloadJson.bar_count, 1);
});
test('rejects existing symbol mismatches before writing any bars', async () => {
  const client = {
    $transaction: (fn) =>
      fn({
        symbol: {
          findUnique: async () => ({ assetType: 'CRYPTO', currency: 'USD' }),
        },
      }),
  };
  await assert.rejects(importData(input(), client), /metadata/);
});
test('requires USD crypto pairs and consistent symbol metadata', () => {
  const value = input();
  value.series[0].asset_type = 'CRYPTO';
  assert.throws(() => validateImport(value, Date.parse('2026-01-03')));
  value.series[0].symbol = 'BTC-USD';
  assert.equal(
    validateImport(value, Date.parse('2026-01-03')).series.length,
    1,
  );
  value.series.push({
    ...value.series[0],
    asset_type: 'EQUITY',
    timeframe: '1h',
  });
  assert.throws(() => validateImport(value, Date.parse('2026-01-03')));
});
