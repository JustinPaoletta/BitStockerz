import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Prefixes absolute API origin when `environment.apiBaseUrl` is set.
 * Locally the value is empty and the Angular proxy serves `/api`.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiBaseUrl?.replace(/\/$/, '') ?? '';
  if (!base || !isLocalApiRequest(req.url)) {
    return next(req);
  }
  return next(req.clone({ url: `${base}${req.url}` }));
};

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function isLocalApiRequest(url: string): boolean {
  if (!/^\/api(?:[/?#]|$)/.test(url)) return false;
  try {
    const destination = new URL(url, window.location.href);
    return (
      destination.protocol === window.location.protocol &&
      destination.host === window.location.host &&
      isApiPath(destination.pathname)
    );
  } catch {
    return false;
  }
}
