import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { SymbolSearchQueryDto } from './symbol-search-query.dto';

function properties(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe('SymbolSearchQueryDto', () => {
  it('trims the search query and coerces numeric limit', async () => {
    const query = plainToInstance(SymbolSearchQueryDto, {
      q: '  btc  ',
      asset_type: 'CRYPTO',
      limit: '12',
    });

    await expect(validate(query)).resolves.toEqual([]);
    expect(query).toMatchObject({
      q: 'btc',
      asset_type: 'CRYPTO',
      limit: 12,
    });
  });

  it('allows omitted optional fields', async () => {
    const query = plainToInstance(SymbolSearchQueryDto, {});

    await expect(validate(query)).resolves.toEqual([]);
    expect(query.q).toBeUndefined();
    expect(query.asset_type).toBeUndefined();
    expect(query.limit).toBeUndefined();
  });

  it('leaves non-string query values unchanged', () => {
    const query = plainToInstance(SymbolSearchQueryDto, {
      q: 42,
    });

    expect(query.q).toBe(42);
  });

  it.each([
    {
      name: 'unknown asset type',
      input: { asset_type: 'FOREX' },
      property: 'asset_type',
    },
    {
      name: 'zero limit',
      input: { limit: 0 },
      property: 'limit',
    },
    {
      name: 'excessive limit',
      input: { limit: 101 },
      property: 'limit',
    },
    {
      name: 'fractional limit',
      input: { limit: 1.5 },
      property: 'limit',
    },
  ])('rejects $name', async ({ input, property }) => {
    const errors = await validate(plainToInstance(SymbolSearchQueryDto, input));

    expect(properties(errors)).toContain(property);
  });
});
