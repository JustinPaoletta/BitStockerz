import { Prisma } from '@prisma/client';

export const MONEY_SCALE = 2;
export const TRADING_SCALE = 8;

export function decimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function roundMoney(value: Prisma.Decimal.Value): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(
    MONEY_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function roundTrading(value: Prisma.Decimal.Value): Prisma.Decimal {
  return decimal(value).toDecimalPlaces(
    TRADING_SCALE,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

export function cashNotional(
  quantity: Prisma.Decimal.Value,
  price: Prisma.Decimal.Value,
): Prisma.Decimal {
  return roundMoney(decimal(quantity).mul(price));
}

export function formatMoney(value: Prisma.Decimal.Value): string {
  return roundMoney(value).toFixed(MONEY_SCALE);
}

export function formatTrading(value: Prisma.Decimal.Value): string {
  return roundTrading(value).toFixed(TRADING_SCALE);
}
