import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { mapBacktestDetail, mapBacktestList, mapCreateBacktest } from './backtest.mapper';
import type {
  BacktestDetailResponse,
  BacktestListResponse,
  CreateBacktestRequest,
  CreateBacktestResponse,
  ProblemDetails,
} from './models/backtest.models';

@Injectable({ providedIn: 'root' })
export class BacktestsApiService {
  research(id: string) {
    return this.http.get<{
      run: import('./models/backtest.models').BacktestRun;
      results: import('./models/backtest.models').BacktestResults | null;
      definition: import('../strategies/data/strategies-api.service').StrategyDefinition;
      version_number: number;
    }>(`/api/backtests/${id}/research`);
  }
  exportResults(id: string) {
    return this.http
      .get(`/api/backtests/${id}/results.csv`, { responseType: 'text' })
      .pipe(catchError(toUserError));
  }

  exportTrades(id: string) {
    return this.http.get(`/api/backtests/${id}/trades.csv`, { responseType: 'text' });
  }

  private readonly http = inject(HttpClient);

  list(limit = 50, offset = 0): Observable<BacktestListResponse> {
    const params = new HttpParams().set('limit', limit).set('offset', offset);
    return this.http
      .get<unknown>('/api/backtests', { params })
      .pipe(map(mapBacktestList), catchError(toUserError));
  }

  create(input: CreateBacktestRequest): Observable<CreateBacktestResponse> {
    return this.http
      .post<unknown>('/api/backtests', input)
      .pipe(map(mapCreateBacktest), catchError(toUserError));
  }

  detail(id: string, tradesLimit = 500, tradesOffset = 0): Observable<BacktestDetailResponse> {
    const params = new HttpParams()
      .set('trades_limit', tradesLimit)
      .set('trades_offset', tradesOffset);
    return this.http
      .get<unknown>(`/api/backtests/${id}`, { params })
      .pipe(map(mapBacktestDetail), catchError(toUserError));
  }
}

function toUserError(error: unknown): Observable<never> {
  if (error instanceof HttpErrorResponse) {
    const problem = error.error as ProblemDetails | undefined;
    return throwError(
      () =>
        new Error(
          problem?.detail ?? `${problem?.code ?? 'REQUEST_FAILED'}: The API request failed.`,
        ),
    );
  }
  return throwError(() => (error instanceof Error ? error : new Error('Request failed.')));
}
