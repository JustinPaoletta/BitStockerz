import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { DomainError } from '../errors/domain-error';
import { ErrorCode } from '../errors/error-codes.enum';

export const PRIVATE_BETA_HEADER = 'x-bitstockerz-beta-key';
export const PRIVATE_BETA_MONITOR_HEADER = 'x-bitstockerz-monitor-key';

function matchesKey(received: unknown, expected: string | undefined): boolean {
  return (
    typeof received === 'string' &&
    /^[a-f0-9]{64}$/.test(received) &&
    typeof expected === 'string' &&
    /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  );
}

@Injectable()
export class PrivateBetaGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.server.privateBetaEnabled) return true;
    const request = context.switchToHttp().getRequest<Request>();
    // Fly and the deployment workflow need credential-free health probes.
    if (
      ['GET', 'HEAD'].includes(request.method) &&
      /^\/api\/health\/(live|ready)\/?$/.test(request.path)
    )
      return true;

    if (
      request.method === 'GET' &&
      request.path === '/api/market-data/health' &&
      matchesKey(
        request.headers[PRIVATE_BETA_MONITOR_HEADER],
        this.config.server.privateBetaMonitorKey,
      )
    )
      return true;

    const received = request.headers[PRIVATE_BETA_HEADER];
    const expected = this.config.server.privateBetaProxyKey;
    if (!matchesKey(received, expected))
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    return true;
  }
}
