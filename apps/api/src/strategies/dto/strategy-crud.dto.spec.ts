import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetStrategyQueryDto } from './get-strategy-query.dto';
import { ListStrategiesQueryDto } from './list-strategies-query.dto';
import { UpdateStrategyDto } from './update-strategy.dto';
import { ValidateStrategyDto } from './validate-strategy.dto';

function validationFields(object: object): Promise<string[]> {
  return validate(object).then((errors) =>
    errors.map((error) => error.property),
  );
}

describe('strategy CRUD DTOs', () => {
  it('coerces and bounds list and version query numbers', async () => {
    const list = plainToInstance(ListStrategiesQueryDto, {
      limit: '100',
      offset: '10000',
    });
    const details = plainToInstance(GetStrategyQueryDto, { version: '2' });

    await expect(validate(list)).resolves.toHaveLength(0);
    await expect(validate(details)).resolves.toHaveLength(0);
    expect(list).toMatchObject({ limit: 100, offset: 10_000 });
    expect(details.version).toBe(2);

    await expect(
      validationFields(
        plainToInstance(ListStrategiesQueryDto, {
          limit: '101',
          offset: '-1',
        }),
      ),
    ).resolves.toEqual(expect.arrayContaining(['limit', 'offset']));
    await expect(
      validationFields(plainToInstance(GetStrategyQueryDto, { version: '0' })),
    ).resolves.toEqual(['version']);
  });

  it('preserves update null semantics and rejects coerced text values', async () => {
    const clear = plainToInstance(
      UpdateStrategyDto,
      { description: null, name: '  Renamed  ' },
      { enableImplicitConversion: true },
    );
    const invalid = plainToInstance(
      UpdateStrategyDto,
      { name: 123, description: 456 },
      { enableImplicitConversion: true },
    );

    await expect(validate(clear)).resolves.toHaveLength(0);
    expect(clear).toMatchObject({ description: null, name: 'Renamed' });
    await expect(validationFields(invalid)).resolves.toEqual(
      expect.arrayContaining(['name', 'description']),
    );
  });

  it('accepts either validation field for service-level XOR enforcement', async () => {
    const inline = plainToInstance(ValidateStrategyDto, { definition: {} });
    const persisted = plainToInstance(ValidateStrategyDto, {
      strategy_id: '00000000-0000-4000-8000-000000000001',
    });
    const invalidId = plainToInstance(ValidateStrategyDto, {
      strategy_id: 'not-a-uuid',
    });

    await expect(validate(inline)).resolves.toHaveLength(0);
    await expect(validate(persisted)).resolves.toHaveLength(0);
    await expect(validationFields(invalidId)).resolves.toEqual(['strategy_id']);
  });
});
