import type { Prisma } from '@prisma/client';

export type TradingSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';
export type OrderRejectReason =
  | 'NO_MARKET_PRICE'
  | 'MAX_ORDER_NOTIONAL'
  | 'MAX_POSITION_PCT'
  | 'MIN_CASH_REMAINING'
  | 'INSUFFICIENT_CASH'
  | 'INSUFFICIENT_POSITION';

export interface PaperAccountRecord {
  id: number;
  userId: string;
  name: string;
  baseCurrency: string;
  startingBalance: Prisma.Decimal;
  cashBalance: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PositionRecord {
  id: number;
  paperAccountId: number;
  symbolId: number;
  quantity: Prisma.Decimal;
  avgCost: Prisma.Decimal;
  updatedAt: Date;
}

export interface OrderRecord {
  id: string;
  paperAccountId: number;
  symbolId: number;
  side: TradingSide;
  quantity: Prisma.Decimal;
  orderType: 'MARKET';
  status: OrderStatus;
  avgFillPrice: Prisma.Decimal | null;
  rejectReason: OrderRejectReason | null;
  clientOrderId: string | null;
  requestedAt: Date;
  filledAt: Date | null;
}

export interface ExecutionRecord {
  id: string;
  orderId: string;
  paperAccountId: number;
  symbolId: number;
  side: TradingSide;
  quantity: Prisma.Decimal;
  price: Prisma.Decimal;
  executedAt: Date;
}

export interface PaperAccountResponse {
  id: number;
  base_currency: string;
  starting_balance: string;
  cash_balance: string;
  created_at: string;
}

export interface PositionResponse {
  symbol: string;
  quantity: string;
  avg_cost: string;
}

export interface OrderResponse {
  id: string;
  symbol: string;
  side: TradingSide;
  quantity: string;
  status: OrderStatus;
  avg_fill_price?: string;
  reject_reason?: OrderRejectReason;
  requested_at: string;
  filled_at?: string;
  client_order_id?: string;
}

export interface ExecutionResponse {
  executed_at: string;
  symbol: string;
  side: TradingSide;
  quantity: string;
  price: string;
  notional: string;
}

export interface PlaceOrderInput {
  symbol: string;
  side: TradingSide;
  quantity: string;
  clientOrderId?: string;
}

export type TradingTransaction = Prisma.TransactionClient;
