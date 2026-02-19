import { validate } from 'class-validator';
import { CreateStrategyDto } from './create-strategy.dto';

describe('CreateStrategyDto', () => {
  it('accepts a valid payload', async () => {
    const dto = new CreateStrategyDto();
    dto.name = 'Breakout';
    dto.description = 'Simple breakout strategy';
    dto.asset_type = 'CRYPTO';
    dto.timeframe = '1h';
    dto.definition = { rules: [] };

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid values', async () => {
    const dto = new CreateStrategyDto();
    dto.name = 123 as unknown as string;
    dto.description = 456 as unknown as string;
    dto.asset_type = 'FOREX';
    dto.timeframe = '5m';

    const errors = await validate(dto);
    const fields = errors.map((error) => error.property);
    expect(fields).toEqual(
      expect.arrayContaining(['name', 'description', 'asset_type', 'timeframe']),
    );
  });

  it('accepts optional fields when omitted', async () => {
    const dto = new CreateStrategyDto();
    dto.name = 'Momentum';
    dto.asset_type = 'EQUITY';
    dto.timeframe = '1d';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
