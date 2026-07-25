import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { MetricsDomain } from './metrics.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.metrics.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const domain = classifyDomain(request.path ?? request.url ?? '');

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        const statusCode = response.statusCode || 500;
        const isError = statusCode >= 400;
        this.metrics.recordHttp(durationMs, isError);
        if (isError) {
          this.metrics.recordError(domain);
        }
      }),
    );
  }
}

function classifyDomain(path: string): MetricsDomain {
  const normalized = path.toLowerCase();
  if (normalized.includes('/auth') || normalized.includes('/me')) {
    return 'auth';
  }
  if (normalized.includes('/market-data')) {
    return 'market_data';
  }
  if (normalized.includes('/jobs')) {
    return 'jobs';
  }
  return 'unknown';
}
