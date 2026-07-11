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
import type { CandleOrder, CryptoInterval } from '../market-data.types';
import { isValidDateOnly, isValidIsoDateTime } from './candle-query-validation';

@ValidatorConstraint({ name: 'isCryptoCandleBoundary', async: false })
class IsCryptoCandleBoundaryConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const query = args.object as CryptoCandlesQueryDto;
    if (query.interval === '1d') {
      return isValidDateOnly(value);
    }

    if (query.interval === '1h') {
      return isValidIsoDateTime(value);
    }

    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const query = args.object as CryptoCandlesQueryDto;
    return query.interval === '1h'
      ? `${args.property} must be a valid ISO 8601 datetime including a timezone when interval is 1h`
      : `${args.property} must be a valid calendar date in YYYY-MM-DD format when interval is 1d`;
  }
}

@ValidatorConstraint({ name: 'isCryptoCandleRange', async: false })
class IsCryptoCandleRangeConstraint implements ValidatorConstraintInterface {
  validate(end: unknown, args: ValidationArguments): boolean {
    const query = args.object as CryptoCandlesQueryDto;

    if (
      query.interval === '1d' &&
      isValidDateOnly(query.start) &&
      isValidDateOnly(end)
    ) {
      return query.start <= end;
    }

    if (
      query.interval === '1h' &&
      isValidIsoDateTime(query.start) &&
      isValidIsoDateTime(end)
    ) {
      return Date.parse(query.start) <= Date.parse(end);
    }

    return true;
  }

  defaultMessage(): string {
    return 'end must be on or after start';
  }
}

export class CryptoCandlesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsIn(['1d', '1h'])
  interval!: CryptoInterval;

  @IsString()
  @Validate(IsCryptoCandleBoundaryConstraint)
  start!: string;

  @IsString()
  @Validate(IsCryptoCandleBoundaryConstraint)
  @Validate(IsCryptoCandleRangeConstraint)
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
