import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { isValidDateOnly, isValidIsoDateTime } from './candle-query-validation';
import { CryptoCandlesQueryDto } from './crypto-candles-query.dto';
import { EquityCandlesQueryDto } from './equity-candles-query.dto';

function properties(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe('candle query validation helpers', () => {
  it('accepts only real YYYY-MM-DD calendar dates', () => {
    expect(isValidDateOnly('2024-02-29')).toBe(true);
    expect(isValidDateOnly('2026-02-29')).toBe(false);
    expect(isValidDateOnly('2026-01-01T00:00:00.000Z')).toBe(false);
    expect(isValidDateOnly(20260101)).toBe(false);
  });

  it('accepts only ISO datetimes that include a timezone', () => {
    expect(isValidIsoDateTime('2026-01-15T01:30:00.000Z')).toBe(true);
    expect(isValidIsoDateTime('2026-01-15T01:30:00-05:00')).toBe(true);
    expect(isValidIsoDateTime('2026-01-15T01:30:00')).toBe(false);
    expect(isValidIsoDateTime('2026-02-30T01:30:00.000Z')).toBe(false);
    expect(isValidIsoDateTime(null)).toBe(false);
  });
});

describe('EquityCandlesQueryDto', () => {
  it('returns calendar-date messages for invalid equity boundaries', async () => {
    const query = plainToInstance(EquityCandlesQueryDto, {
      symbol: 'AAPL',
      start: '2026-02-30',
      end: '2026-03-01',
    });
    const errors = await validate(query);

    expect(errors.some((error) => error.property === 'start')).toBe(true);
    const startError = errors.find((error) => error.property === 'start');
    expect(startError?.constraints?.isEquityCandleDate).toContain('YYYY-MM-DD');
  });

  it('normalizes a valid symbol and numeric limit', async () => {
    const query = plainToInstance(EquityCandlesQueryDto, {
      symbol: ' aapl ',
      start: '2026-01-05',
      end: '2026-01-09',
      limit: '25',
      order: 'desc',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query).toMatchObject({
      symbol: 'AAPL',
      start: '2026-01-05',
      end: '2026-01-09',
      limit: 25,
      order: 'desc',
    });
  });

  it('allows omitted optional fields', async () => {
    const query = plainToInstance(EquityCandlesQueryDto, {
      symbol: 'MSFT',
      start: '2026-01-05',
      end: '2026-01-05',
      limit: undefined,
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.limit).toBeUndefined();
    expect(query.order).toBeUndefined();
  });

  it.each([
    {
      name: 'missing symbol',
      input: { start: '2026-01-05', end: '2026-01-09' },
      property: 'symbol',
    },
    {
      name: 'empty symbol',
      input: { symbol: '   ', start: '2026-01-05', end: '2026-01-09' },
      property: 'symbol',
    },
    {
      name: 'non-string symbol',
      input: { symbol: 42, start: '2026-01-05', end: '2026-01-09' },
      property: 'symbol',
    },
    {
      name: 'missing start',
      input: { symbol: 'AAPL', end: '2026-01-09' },
      property: 'start',
    },
    {
      name: 'impossible calendar date',
      input: { symbol: 'AAPL', start: '2026-02-30', end: '2026-03-01' },
      property: 'start',
    },
    {
      name: 'datetime boundary',
      input: {
        symbol: 'AAPL',
        start: '2026-01-05T00:00:00.000Z',
        end: '2026-01-09',
      },
      property: 'start',
    },
    {
      name: 'reversed range',
      input: { symbol: 'AAPL', start: '2026-02-01', end: '2026-01-01' },
      property: 'end',
    },
    {
      name: 'zero limit',
      input: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        limit: 0,
      },
      property: 'limit',
    },
    {
      name: 'excessive limit',
      input: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        limit: 5001,
      },
      property: 'limit',
    },
    {
      name: 'fractional limit',
      input: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        limit: 1.5,
      },
      property: 'limit',
    },
    {
      name: 'unknown order',
      input: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        order: 'sideways',
      },
      property: 'order',
    },
  ])('rejects $name', async ({ input, property }) => {
    const errors = await validate(
      plainToInstance(EquityCandlesQueryDto, input),
    );

    expect(properties(errors)).toContain(property);
  });
});

describe('CryptoCandlesQueryDto', () => {
  it('returns hourly boundary messages for invalid crypto datetimes', async () => {
    const query = plainToInstance(CryptoCandlesQueryDto, {
      symbol: 'BTC-USD',
      interval: '1h',
      start: '2026-01-15',
      end: '2026-01-15T02:00:00.000Z',
    });
    const errors = await validate(query);

    expect(errors.some((error) => error.property === 'start')).toBe(true);
    const startError = errors.find((error) => error.property === 'start');
    expect(startError?.constraints?.isCryptoCandleBoundary).toContain(
      'ISO 8601 datetime',
    );
  });

  it('returns daily boundary messages for invalid crypto dates', async () => {
    const query = plainToInstance(CryptoCandlesQueryDto, {
      symbol: 'BTC-USD',
      interval: '1d',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-03',
    });
    const errors = await validate(query);

    expect(errors.some((error) => error.property === 'start')).toBe(true);
    const startError = errors.find((error) => error.property === 'start');
    expect(startError?.constraints?.isCryptoCandleBoundary).toContain(
      'YYYY-MM-DD',
    );
  });

  it.each([
    {
      interval: '1d',
      start: '2026-01-01',
      end: '2026-01-30',
    },
    {
      interval: '1h',
      start: '2026-01-15T00:00:00.000Z',
      end: '2026-01-15T02:00:00.000Z',
    },
    {
      interval: '1h',
      start: '2026-01-15T00:00:00-05:00',
      end: '2026-01-15T02:00:00-05:00',
    },
  ])('accepts valid $interval boundaries', async ({ interval, start, end }) => {
    const query = plainToInstance(CryptoCandlesQueryDto, {
      symbol: ' btc-usd ',
      interval,
      start,
      end,
      limit: '12',
      order: 'asc',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.symbol).toBe('BTC-USD');
    expect(query.limit).toBe(12);
  });

  it.each([
    {
      name: 'missing interval',
      input: {
        symbol: 'BTC-USD',
        start: '2026-01-01',
        end: '2026-01-03',
      },
      property: 'interval',
    },
    {
      name: 'unknown interval',
      input: {
        symbol: 'BTC-USD',
        interval: '5m',
        start: 'anything',
        end: 'anything',
      },
      property: 'interval',
    },
    {
      name: 'daily datetime',
      input: {
        symbol: 'BTC-USD',
        interval: '1d',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-03',
      },
      property: 'start',
    },
    {
      name: 'hourly date-only value',
      input: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15',
        end: '2026-01-15T02:00:00.000Z',
      },
      property: 'start',
    },
    {
      name: 'hourly datetime without timezone',
      input: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15T00:00:00',
        end: '2026-01-15T02:00:00.000Z',
      },
      property: 'start',
    },
    {
      name: 'reversed daily range',
      input: {
        symbol: 'BTC-USD',
        interval: '1d',
        start: '2026-01-03',
        end: '2026-01-01',
      },
      property: 'end',
    },
    {
      name: 'reversed hourly range',
      input: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15T03:00:00.000Z',
        end: '2026-01-15T02:00:00.000Z',
      },
      property: 'end',
    },
    {
      name: 'invalid hourly end',
      input: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15T00:00:00.000Z',
        end: 'not-a-date',
      },
      property: 'end',
    },
    {
      name: 'zero limit',
      input: {
        symbol: 'BTC-USD',
        interval: '1d',
        start: '2026-01-01',
        end: '2026-01-03',
        limit: 0,
      },
      property: 'limit',
    },
    {
      name: 'invalid order',
      input: {
        symbol: 'BTC-USD',
        interval: '1d',
        start: '2026-01-01',
        end: '2026-01-03',
        order: 'sideways',
      },
      property: 'order',
    },
  ])('rejects $name', async ({ input, property }) => {
    const errors = await validate(
      plainToInstance(CryptoCandlesQueryDto, input),
    );

    expect(properties(errors)).toContain(property);
  });
});
