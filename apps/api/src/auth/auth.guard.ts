import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DomainError } from '../common/errors/domain-error';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { AuthService } from './auth.service';

export const AUTH_TOKEN_REQUEST_KEY = 'authToken';

export interface AuthenticatedRequest extends Request {
  [AUTH_TOKEN_REQUEST_KEY]?: string;
}

function readAuthorizationHeader(request: Request): string | undefined {
  const headerValue = request.headers.authorization;
  if (typeof headerValue === 'string') {
    return headerValue;
  }

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return undefined;
}

export function extractBearerToken(
  headerValue: string | undefined,
): string | undefined {
  if (!headerValue || !headerValue.startsWith('Bearer ')) {
    return undefined;
  }

  const token = headerValue.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = readAuthorizationHeader(request);
    const token = extractBearerToken(authorization);

    if (!token) {
      throw new DomainError(ErrorCode.UNAUTHORIZED);
    }

    this.authService.requireUserBySessionToken(token);
    request[AUTH_TOKEN_REQUEST_KEY] = token;
    return true;
  }
}
