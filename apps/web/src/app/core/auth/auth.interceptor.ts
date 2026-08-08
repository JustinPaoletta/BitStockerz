import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

const PUBLIC_AUTH_PREFIXES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/webauthn/',
  '/api/auth/oauth/',
];

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const tokens = inject(TokenStorageService);
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = tokens.get();
  const authedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authedRequest).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
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

function isPublicAuthRequest(url: string): boolean {
  try {
    const path = new URL(url, window.location.origin).pathname;
    return PUBLIC_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix));
  } catch {
    return PUBLIC_AUTH_PREFIXES.some((prefix) => url.includes(prefix));
  }
}
