import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';

export type AiConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AiWarning {
  code: string;
  severity: AiConfidence;
  message: string;
  evidence_paths: string[];
}

export interface AiIssue {
  code: string;
  severity: AiConfidence;
  message: string;
  evidence: string[];
}

export interface AiSuggestion {
  code: string;
  title: string;
  description: string;
  evidence: string[];
}

export interface AiExplainStrategyResponse {
  disclaimer: string;
  confidence: AiConfidence;
  ai_request_id: string;
  explanation: string;
  warnings: AiWarning[];
}

export interface AiValidateStrategyResponse {
  disclaimer: string;
  confidence: AiConfidence;
  ai_request_id: string;
  warnings: AiWarning[];
}

export interface AiExplainBacktestResponse {
  disclaimer: string;
  confidence: AiConfidence;
  ai_request_id: string;
  explanation: string;
  issues: AiIssue[];
}

export interface AiSuggestImprovementsResponse {
  disclaimer: string;
  confidence: AiConfidence;
  ai_request_id: string;
  suggestions: AiSuggestion[];
}

@Injectable({ providedIn: 'root' })
export class AiApiService {
  private readonly http = inject(HttpClient);

  explainStrategy(strategyId: string): Observable<AiExplainStrategyResponse> {
    return this.http
      .post<AiExplainStrategyResponse>('/api/ai/explain-strategy', {
        strategy_id: strategyId,
      })
      .pipe(catchError(toUserError));
  }

  validateStrategy(strategyId: string): Observable<AiValidateStrategyResponse> {
    return this.http
      .post<AiValidateStrategyResponse>('/api/ai/validate-strategy', {
        strategy_id: strategyId,
      })
      .pipe(catchError(toUserError));
  }

  explainBacktest(backtestRunId: string): Observable<AiExplainBacktestResponse> {
    return this.http
      .post<AiExplainBacktestResponse>('/api/ai/explain-backtest', {
        backtest_run_id: backtestRunId,
      })
      .pipe(catchError(toUserError));
  }

  suggestImprovements(
    strategyId: string,
    backtestRunId?: string,
  ): Observable<AiSuggestImprovementsResponse> {
    return this.http
      .post<AiSuggestImprovementsResponse>('/api/ai/suggest-improvements', {
        strategy_id: strategyId,
        ...(backtestRunId ? { backtest_run_id: backtestRunId } : {}),
      })
      .pipe(catchError(toUserError));
  }
}

function toUserError(error: HttpErrorResponse) {
  const body = error.error as { detail?: string; code?: string } | null;
  const code = body?.code;
  if (code === 'AI_DISABLED') {
    return throwError(() => new Error('Kernel AI is disabled on this API.'));
  }
  if (code === 'AI_RATE_LIMIT') {
    return throwError(() => new Error('Daily Kernel AI limit reached. Try again tomorrow.'));
  }
  if (code === 'AI_PROVIDER_ERROR' || error.status === 502) {
    return throwError(() => new Error('Kernel AI provider failed. Retry in a moment.'));
  }
  if (code === 'AI_TIMEOUT' || error.status === 504) {
    return throwError(() => new Error('Kernel AI timed out. Retry in a moment.'));
  }
  return throwError(
    () => new Error(body?.detail || error.message || 'Kernel AI request failed.'),
  );
}
