import { IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExplainStrategyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  strategy_id!: string;
}

export class ValidateStrategyAiDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  strategy_id!: string;
}

export class ExplainBacktestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  backtest_run_id!: string;
}

export class SuggestImprovementsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  strategy_id!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  backtest_run_id?: string;
}
