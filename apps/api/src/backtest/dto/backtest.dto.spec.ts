import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBacktestDto } from './create-backtest.dto';
import {
  BacktestDetailQueryDto,
  ListBacktestsQueryDto,
} from './list-backtests-query.dto';

describe('backtest DTOs', () => {
  it('normalizes a valid create payload without coercing decimal strings', async () => {
    const dto = plainToInstance(CreateBacktestDto, {
      strategy_id: '550e8400-e29b-41d4-a716-446655440000',
      strategy_version_id: '2',
      symbol: ' aapl ',
      timeframe: '1d',
      start_date: '2026-01-01',
      end_date: '2026-01-02',
      initial_equity: '10000',
    });
    expect(dto.symbol).toBe('AAPL');
    expect(dto.strategy_version_id).toBe(2);
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts numeric create defaults and rejects malformed fields', async () => {
    const valid = plainToInstance(CreateBacktestDto, {
      strategy_id: '550e8400-e29b-41d4-a716-446655440000',
      symbol: 'BTC-USD',
      timeframe: '1h',
      start_date: '2026-01-01T00:00:00Z',
      end_date: '2026-01-02T00:00:00Z',
      initial_equity: 100.25,
    });
    expect(await validate(valid)).toEqual([]);

    const invalid = plainToInstance(CreateBacktestDto, {
      strategy_id: 'bad',
      strategy_version_id: 0,
      symbol: '',
      timeframe: '5m',
      start_date: 'bad',
      end_date: 'bad',
      initial_equity: -1,
    });
    expect((await validate(invalid)).length).toBeGreaterThan(5);
  });

  it('transforms and validates list and detail pagination', async () => {
    const list = plainToInstance(ListBacktestsQueryDto, {
      symbol: ' btc-usd ',
      limit: '10',
      offset: '2',
      status: 'completed',
    });
    expect(list).toMatchObject({ symbol: 'BTC-USD', limit: 10, offset: 2 });
    expect(await validate(list)).toEqual([]);

    const detail = plainToInstance(BacktestDetailQueryDto, {
      trades_limit: '1000',
      trades_offset: '100000',
    });
    expect(await validate(detail)).toEqual([]);
    expect(
      await validate(
        plainToInstance(BacktestDetailQueryDto, {
          trades_limit: 1001,
          trades_offset: -1,
        }),
      ),
    ).not.toHaveLength(0);
  });
});
