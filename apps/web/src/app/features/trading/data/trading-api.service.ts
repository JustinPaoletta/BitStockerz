import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

export interface PortfolioSummary {
  cash_balance: string;
  total_position_value: string;
  total_equity: string;
  unrealized_pnl_total: string;
}

export interface PositionRow {
  symbol: string;
  quantity: string;
  avg_cost: string;
}

export interface ExecutionRow {
  executed_at: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  notional: string;
}

export interface OrderRow {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  status: string;
  avg_fill_price?: string;
  reject_reason?: string;
  requested_at: string;
  filled_at?: string;
  client_order_id?: string;
}

export interface PlaceOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  client_order_id: string;
}

export interface PlaceOrderResponse {
  order: OrderRow;
}

@Injectable({ providedIn: 'root' })
export class TradingApiService {
  private readonly http = inject(HttpClient);

  portfolioSummary(): Observable<PortfolioSummary> {
    return this.http
      .get<PortfolioSummary>('/api/trading/portfolio-summary')
      .pipe(catchError(toUserError));
  }

  positions(): Observable<{ positions: PositionRow[] }> {
    return this.http
      .get<{ positions: PositionRow[] }>('/api/trading/positions')
      .pipe(catchError(toUserError));
  }

  executions(limit = 5, offset = 0): Observable<{
    executions: ExecutionRow[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http
      .get<{
        executions: ExecutionRow[];
        limit: number;
        offset: number;
        has_more: boolean;
      }>('/api/trading/executions', { params })
      .pipe(catchError(toUserError));
  }

  orders(limit = 10, offset = 0): Observable<{
    orders: OrderRow[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http
      .get<{
        orders: OrderRow[];
        limit: number;
        offset: number;
        has_more: boolean;
      }>('/api/trading/orders', { params })
      .pipe(catchError(toUserError));
  }

  placeOrder(body: PlaceOrderRequest): Observable<PlaceOrderResponse> {
    return this.http
      .post<PlaceOrderResponse>('/api/trading/orders', body)
      .pipe(catchError(toUserError));
  }
}

function toUserError(error: unknown): Observable<never> {
  if (error instanceof HttpErrorResponse) {
    const problem = error.error as { detail?: string; code?: string } | undefined;
    return throwError(
      () => new Error(problem?.detail ?? `${problem?.code ?? 'REQUEST_FAILED'}: request failed`),
    );
  }
  return throwError(() => (error instanceof Error ? error : new Error('Request failed.')));
}
