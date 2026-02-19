import { StrategiesController } from './strategies.controller';
import { CreateStrategyDto } from './dto/create-strategy.dto';

describe('StrategiesController', () => {
  it('returns the expected strategy payload', () => {
    const controller = new StrategiesController();
    const dto: CreateStrategyDto = {
      name: 'Momentum',
      asset_type: 'EQUITY',
      timeframe: '1d',
    };

    const result = controller.create(dto);

    expect(result).toEqual({
      id: '1',
      name: 'Momentum',
      asset_type: 'EQUITY',
      timeframe: '1d',
    });
  });

  it('preserves different input values', () => {
    const controller = new StrategiesController();
    const dto: CreateStrategyDto = {
      name: 'Reversion',
      asset_type: 'CRYPTO',
      timeframe: '1h',
    };

    const result = controller.create(dto);

    expect(result.name).toBe('Reversion');
    expect(result.asset_type).toBe('CRYPTO');
    expect(result.timeframe).toBe('1h');
  });
});
