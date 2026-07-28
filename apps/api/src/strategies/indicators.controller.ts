import { Controller, Get } from '@nestjs/common';
import { getIndicatorCatalogResponse } from './definition/indicator-catalog';

@Controller('strategies/indicators')
export class IndicatorsController {
  @Get()
  getIndicators() {
    return getIndicatorCatalogResponse();
  }
}
