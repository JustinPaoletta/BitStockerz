import { Injectable, signal } from '@angular/core';

import { Capacitor } from '@capacitor/core';

const ACCESS_TOKEN_KEY = 'bs.access_token';

@Injectable({ providedIn: 'root' })
export class TokenStorageService {
  private readonly token = signal<string | null>(this.readStorage());

  get(): string | null {
    return this.token();
  }

  set(value: string): void {
    // The prototype keeps native bearer tokens in memory only. Relaunch requires sign-in.
    if (!Capacitor.isNativePlatform()) sessionStorage.setItem(ACCESS_TOKEN_KEY, value);
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
      return Capacitor.isNativePlatform() ? null : sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  }
}
