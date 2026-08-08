import { Injectable, signal } from '@angular/core';

const ACCESS_TOKEN_KEY = 'bs.access_token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly token = signal<string | null>(this.readStorage());

  get(): string | null {
    return this.token();
  }

  set(value: string): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, value);
    this.token.set(value);
  }

  clear(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    this.token.set(null);
  }

  hasToken(): boolean {
    return this.token() !== null;
  }

  private readStorage(): string | null {
    try {
      return sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
