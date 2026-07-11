import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import type { CandleOrder } from '../market-data.types';
import { isValidDateOnly } from './candle-query-validation';

@ValidatorConstraint({ name: 'isEquityCandleDate', async: false })
class IsEquityCandleDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidDateOnly(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid calendar date in YYYY-MM-DD format`;
  }
}

@ValidatorConstraint({ name: 'isEquityCandleRange', async: false })
class IsEquityCandleRangeConstraint implements ValidatorConstraintInterface {
  validate(end: unknown, args: ValidationArguments): boolean {
    const query = args.object as EquityCandlesQueryDto;
    if (!isValidDateOnly(query.start) || !isValidDateOnly(end)) {
      return true;
    }

    return query.start <= end;
  }

  defaultMessage(): string {
    return 'end must be on or after start';
  }
}

export class EquityCandlesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsString()
  @Validate(IsEquityCandleDateConstraint)
  start!: string;

  @IsString()
  @Validate(IsEquityCandleDateConstraint)
  @Validate(IsEquityCandleRangeConstraint)
  end!: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === undefined ? undefined : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: CandleOrder;
}
