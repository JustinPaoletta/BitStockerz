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
  private readonly http = inject(HttpClient);

  list(): Observable<BacktestListResponse> {
    return this.http
      .get<unknown>('/api/backtests')
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
