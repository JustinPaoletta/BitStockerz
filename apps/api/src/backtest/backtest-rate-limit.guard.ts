import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class BacktestRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, number[]>();
  private lastCleanupAt = Date.now();

  constructor(
    private readonly config: AppConfigService,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request[AUTH_TOKEN_REQUEST_KEY];
    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }
    const userId = this.auth.requireUserBySessionToken(token).id;
    const now = Date.now();
    const windowMs = this.config.backtest.rateLimitWindowMs;
    this.pruneExpiredUsers(now, windowMs);
    const recent = (this.attempts.get(userId) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recent.length >= this.config.backtest.rateLimitMaxRequests) {
      throw new DomainError(ErrorCode.RATE_LIMITED);
    }
    recent.push(now);
    this.attempts.set(userId, recent);
    return true;
  }

  private pruneExpiredUsers(now: number, windowMs: number): void {
    if (now - this.lastCleanupAt < windowMs) {
      return;
    }
    for (const [userId, timestamps] of this.attempts) {
      if (timestamps.every((timestamp) => now - timestamp >= windowMs)) {
        this.attempts.delete(userId);
      }
    }
    this.lastCleanupAt = now;
  }
}
