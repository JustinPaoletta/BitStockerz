import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStrategyDto } from './create-strategy.dto';

function toDto(input: Record<string, unknown>): CreateStrategyDto {
  return plainToInstance(CreateStrategyDto, input, {
    enableImplicitConversion: true,
  });
}

describe('CreateStrategyDto', () => {
  it('accepts a valid crypto payload and trims the strategy name', async () => {
    const dto = toDto({
      name: '  Breakout  ',
      description: 'Simple breakout strategy',
      asset_type: 'CRYPTO',
      timeframe: '1h',
      symbol_scope: 'SINGLE',
      definition: { rules: [] },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.name).toBe('Breakout');
  });

  it('accepts optional description and symbol_scope when omitted', async () => {
    const dto = toDto({
      name: 'Momentum',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: {},
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires a non-empty name and a definition object', async () => {
    const dto = toDto({
      name: '   ',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: [],
    });

    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'definition']),
    );
  });

  it('rejects an omitted or null definition', async () => {
    const omitted = toDto({
      name: 'Missing',
      asset_type: 'EQUITY',
      timeframe: '1d',
    });
    const nullDefinition = toDto({
      name: 'Null',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: null,
    });

    expect((await validate(omitted)).map((error) => error.property)).toContain(
      'definition',
    );
    expect(
      (await validate(nullDefinition)).map((error) => error.property),
    ).toContain('definition');
  });

  it('rejects unsupported enum values and overlong names', async () => {
    const dto = toDto({
      name: 'x'.repeat(256),
      description: 123,
      asset_type: 'FOREX',
      timeframe: '5m',
      symbol_scope: 'PORTFOLIO',
      definition: {},
    });

    const fields = (await validate(dto)).map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining([
        'name',
        'description',
        'asset_type',
        'timeframe',
        'symbol_scope',
      ]),
    );
  });

  it('rejects non-string text fields with the production transform settings', async () => {
    const dto = toDto({
      name: 123,
      description: 456,
      asset_type: 'CRYPTO',
      timeframe: '1h',
      definition: {},
    });

    expect(dto.name).toBe(123);
    expect(dto.description).toBe(456);
    expect((await validate(dto)).map((error) => error.property)).toEqual(
      expect.arrayContaining(['name', 'description']),
    );
  });

  it('rejects null optional fields instead of silently treating them as omitted', async () => {
    const dto = toDto({
      name: 'Strict optionals',
      description: null,
      asset_type: 'CRYPTO',
      timeframe: '1h',
      symbol_scope: null,
      definition: {},
    });

    const fields = (await validate(dto)).map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining(['description', 'symbol_scope']),
    );
  });

  it('rejects hourly equity strategies', async () => {
    const dto = toDto({
      name: 'Hourly Equity',
      asset_type: 'EQUITY',
      timeframe: '1h',
      definition: {},
    });

    const timeframeError = (await validate(dto)).find(
      (error) => error.property === 'timeframe',
    );
    expect(timeframeError?.constraints).toMatchObject({
      strategyTimeframeCompatibility:
        'timeframe must be 1d when asset_type is EQUITY',
    });
  });
});
