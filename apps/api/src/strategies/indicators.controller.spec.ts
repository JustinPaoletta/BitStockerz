import {
  INDICATOR_CATALOG,
  getIndicatorCatalogResponse,
} from './definition/indicator-catalog';
import { IndicatorsController } from './indicators.controller';

describe('IndicatorsController', () => {
  it('returns the exact public MVP catalog without sharing mutable state', () => {
    const controller = new IndicatorsController();
    const response = controller.getIndicators();

    expect(response).toEqual({ indicators: INDICATOR_CATALOG });
    expect(response.indicators.map((indicator) => indicator.key)).toEqual([
      'SMA',
      'EMA',
      'RSI',
    ]);
    expect(Object.keys(response.indicators[0]).sort()).toEqual(
      [
        'key',
        'display_name',
        'description',
        'params',
        'sources',
        'default_source',
      ].sort(),
    );

    response.indicators[0].display_name = 'Changed';
    expect(getIndicatorCatalogResponse().indicators[0].display_name).toBe(
      'Simple Moving Average',
    );
  });
});
