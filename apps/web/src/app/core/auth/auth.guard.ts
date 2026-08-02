import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStorageService } from './token-storage.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const tokens = inject(TokenStorageService);
  return tokens.hasToken()
    ? true
    : inject(Router).createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
};
