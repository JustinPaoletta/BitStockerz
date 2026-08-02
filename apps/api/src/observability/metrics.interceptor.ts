import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { METRICS_HTTP_RECORDED, classifyMetricsDomain } from './metrics-domain';
import { MetricsService } from './metrics.service';

type RequestWithMetrics = Request & {
  [METRICS_HTTP_RECORDED]?: boolean;
};

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.metrics.enabled || context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithMetrics>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const domain = classifyMetricsDomain(request.path ?? request.url ?? '');

    return next.handle().pipe(
      tap({
        next: () => {
          if (request[METRICS_HTTP_RECORDED]) {
            return;
          }
          const durationMs = Date.now() - startedAt;
          const statusCode = response.statusCode || 200;
          const isError = statusCode >= 400;
          this.metrics.recordHttp(durationMs, isError);
          if (isError) {
            this.metrics.recordError(domain);
          }
          request[METRICS_HTTP_RECORDED] = true;
        },
      }),
    );
  }
}
