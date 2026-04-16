import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';
import type { AuthenticatedRequest } from './auth.guard';

interface RateLimitBucket {
  timestamps: number[];
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = this.buildKey(request);
    const now = Date.now();
    const windowMs = this.config.auth.rateLimitWindowMs;
    const maxRequests = this.config.auth.rateLimitMaxRequests;

    const bucket = this.buckets.get(key) ?? { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((timestamp) => now - timestamp < windowMs);

    if (bucket.timestamps.length >= maxRequests) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        'Too many authentication attempts. Please try again shortly.',
      );
    }

    bucket.timestamps.push(now);
    this.buckets.set(key, bucket);
    return true;
  }

  private buildKey(request: AuthenticatedRequest): string {
    const route = request.route?.path ?? request.path ?? 'unknown';
    const ip = request.ip ?? request.socket?.remoteAddress ?? 'unknown';
    return `${route}:${ip}`;
  }
}
