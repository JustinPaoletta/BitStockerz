import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

export interface StrategySummary {
  id: string;
  name: string;
  description?: string | null;
  asset_type: 'EQUITY' | 'CRYPTO';
  timeframe: '1d' | '1h';
  version_number: number;
  updated_at: string;
  created_at: string;
}

export interface StrategyDetail extends StrategySummary {
  definition: StrategyDefinition;
  summary?: string;
  is_latest?: boolean;
  version_created_at?: string;
  symbol_scope?: string;
  is_active?: boolean;
}

export interface StrategyDefinition {
  indicators: {
    id: string;
    type: string;
    params: Record<string, number>;
    source: string;
  }[];
  entry: {
    logic: 'AND';
    conditions: {
      left: { indicator: string } | { literal: number };
      op: string;
      right: { indicator: string } | { literal: number };
    }[];
  };
  exit: {
    logic: 'AND';
    conditions: {
      left: { indicator: string } | { literal: number };
      op: string;
      right: { indicator: string } | { literal: number };
    }[];
  };
  risk: {
    stop_loss: { type: 'percent'; value: number };
    take_profit: { type: 'percent'; value: number };
  };
}

export interface IndicatorCatalogEntry {
  key: string;
  display_name?: string;
  description?: string;
  params: {
    name: string;
    label?: string;
    min?: number;
    max?: number;
    default?: number;
  }[];
  sources?: string[];
}

@Injectable({ providedIn: 'root' })
export class StrategiesApiService {
  private readonly http = inject(HttpClient);

  list(limit = 50, offset = 0): Observable<{
    items: StrategySummary[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http
      .get<{
        items: StrategySummary[];
        limit: number;
        offset: number;
        has_more: boolean;
      }>('/api/strategies', { params })
      .pipe(catchError(toUserError));
  }

  get(id: string, version?: number): Observable<StrategyDetail> {
    let params = new HttpParams();
    if (version != null) params = params.set('version', version);
    return this.http
      .get<StrategyDetail>(`/api/strategies/${id}`, { params })
      .pipe(catchError(toUserError));
  }

  indicators(): Observable<{ indicators: IndicatorCatalogEntry[] }> {
    return this.http
      .get<{ indicators: IndicatorCatalogEntry[] }>('/api/strategies/indicators')
      .pipe(catchError(toUserError));
  }

  validate(definition: StrategyDefinition): Observable<{
    is_valid: boolean;
    summary?: string | null;
    errors?: { path?: string; message: string; code?: string }[];
  }> {
    return this.http
      .post<{
        is_valid: boolean;
        summary?: string | null;
        errors?: { path?: string; message: string; code?: string }[];
      }>('/api/strategies/validate', { definition })
      .pipe(catchError(toUserError));
  }

  create(body: {
    name: string;
    description?: string;
    asset_type: 'EQUITY' | 'CRYPTO';
    timeframe: '1d' | '1h';
    definition: StrategyDefinition;
  }): Observable<StrategyDetail> {
    return this.http.post<StrategyDetail>('/api/strategies', body).pipe(catchError(toUserError));
  }

  update(
    id: string,
    body: Partial<{
      name: string;
      description: string;
      asset_type: 'EQUITY' | 'CRYPTO';
      timeframe: '1d' | '1h';
      definition: StrategyDefinition;
    }>,
  ): Observable<StrategyDetail> {
    return this.http.put<StrategyDetail>(`/api/strategies/${id}`, body).pipe(catchError(toUserError));
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/strategies/${id}`).pipe(catchError(toUserError));
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
