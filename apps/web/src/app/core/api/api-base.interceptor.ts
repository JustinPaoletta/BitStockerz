import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Prefixes absolute API origin when `environment.apiBaseUrl` is set.
 * Locally the value is empty and the Angular proxy serves `/api`.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiBaseUrl?.replace(/\/$/, '') ?? '';
  if (!base || !req.url.startsWith('/api')) {
    return next(req);
  }
  return next(req.clone({ url: `${base}${req.url}` }));
};
