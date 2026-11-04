import { environment } from '../environments/environment';
import { assertNativeBuild } from './core/native/build-info';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideAppInitializer,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { apiBaseInterceptor } from './core/api/api-base.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAppInitializer(() => {
      const fingerprint = assertNativeBuild(environment);
      if (fingerprint) document.documentElement.dataset['bitstockerzBuild'] = fingerprint;
    }),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([apiBaseInterceptor, authInterceptor])),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
  ],
};
