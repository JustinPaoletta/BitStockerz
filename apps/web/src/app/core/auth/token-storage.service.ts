import { Injectable } from '@angular/core';

const ACCESS_TOKEN_KEY = 'bs.access_token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  get(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  }

  set(token: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  }

  clear(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  hasToken(): boolean {
    return this.get() !== null;
  }
}
