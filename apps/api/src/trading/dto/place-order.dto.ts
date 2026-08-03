import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { TradingSide } from '../trading.types';

const POSITIVE_DECIMAL_18_8 =
  /^(?:0\.\d{0,7}[1-9]|[1-9]\d{0,9}(?:\.\d{1,8})?)$/;

export class PlaceOrderDto {
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9.-]{0,31}$/)
  symbol!: string;

  @IsEnum(['BUY', 'SELL'])
  side!: TradingSide;

  @IsString()
  @Transform(
    ({ obj }: { obj: Record<string, unknown> }): unknown => obj.quantity,
    { toClassOnly: true },
  )
  @Matches(POSITIVE_DECIMAL_18_8, {
    message:
      'quantity must be a positive decimal string with at most 10 integer and 8 fractional digits',
  })
  quantity!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(1, 64)
  client_order_id?: string;
}
