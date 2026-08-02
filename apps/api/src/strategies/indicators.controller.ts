import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiEndpoint, apiSchemaRef } from '../docs/openapi.decorators';
import { getIndicatorCatalogResponse } from './definition/indicator-catalog';

@ApiTags('Strategies')
@Controller('strategies/indicators')
export class IndicatorsController {
  @Get()
  @ApiEndpoint({
    summary: 'Read the strategy indicator catalog',
    description:
      'Returns the stable indicator keys, supported price sources, and parameter bounds accepted by strategy definitions.',
    responseDescription: 'Current canonical indicator catalog.',
    responseSchema: apiSchemaRef('IndicatorCatalog'),
  })
  getIndicators() {
    return getIndicatorCatalogResponse();
  }
}
