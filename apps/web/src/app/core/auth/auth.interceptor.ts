import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { isApiPath } from '../api/api-base.interceptor';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

const PUBLIC_AUTH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/webauthn/',
  '/api/auth/oauth/',
  '/api/auth/providers',
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(TokenStorageService);
  const auth = inject(AuthService);
  const router = inject(Router);
  const trustedRequest = isTrustedApiRequest(request.url);
  const token = tokens.get();
  const authedRequest =
    token && trustedRequest
      ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : request;

  return next(authedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        trustedRequest &&
        !isPublicAuthRequest(request.url)
      ) {
        auth.clearSession();
        void router.navigate(['/login'], {
          queryParams: { returnUrl: router.url },
        });
      }
      return throwError(() => error);
    }),
  );
};

function isTrustedApiRequest(url: string): boolean {
  try {
    const api = new URL(environment.apiBaseUrl || window.location.origin);
    const destination = new URL(url, window.location.origin);
    return (
      (destination.protocol === 'https:' || destination.protocol === 'http:') &&
      !destination.username &&
      !destination.password &&
      destination.origin === api.origin &&
      isApiPath(destination.pathname)
    );
  } catch {
    return false;
  }
}

function isPublicAuthRequest(url: string): boolean {
  try {
    const path = new URL(url, window.location.origin).pathname;
    return PUBLIC_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix));
  } catch {
    return false;
  }
}
