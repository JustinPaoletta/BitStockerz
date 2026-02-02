import { Controller, Post, Body } from '@nestjs/common';
import { CreateStrategyDto } from './dto/create-strategy.dto';

@Controller('strategies')
export class StrategiesController {
  @Post()
  create(@Body() dto: CreateStrategyDto) {
    return { id: '1', name: dto.name, asset_type: dto.asset_type, timeframe: dto.timeframe };
  }
}
