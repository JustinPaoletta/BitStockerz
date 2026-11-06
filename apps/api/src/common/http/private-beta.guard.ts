import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { DomainError } from '../errors/domain-error';
import { MobileAdmissionService } from '../../auth/mobile-admission.service';
import { mobileBootstrap, mobileUserRoute } from '../../auth/mobile-routes';
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
  constructor(
    private readonly config: AppConfigService,
    @Optional() private readonly mobile?: MobileAdmissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
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
    if (
      matchesKey(received, expected) &&
      (!this.config.server.privateBetaMobileEnabled ||
        !mobileUserRoute(request.method, request.path))
    )
      return true;
    if (this.config.server.privateBetaMobileEnabled && this.mobile?.enabled) {
      if (mobileBootstrap(request.method, request.path)) return true;
      if (mobileUserRoute(request.method, request.path)) {
        const header = request.headers.authorization;
        const token =
          typeof header === 'string' && header.startsWith('Bearer ')
            ? header.slice(7).trim()
            : undefined;
        return this.mobile.requireSession(token).then(() => true);
      }
    }
    throw new DomainError(ErrorCode.UNAUTHORIZED);
  }
}
