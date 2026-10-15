import { Capacitor } from '@capacitor/core';
import { TokenStorageService } from './token-storage.service';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));

describe('native session storage', () => {
  afterEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
  });
  it('does not read or persist a native bearer in web storage', () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    sessionStorage.setItem('bs.access_token', 'stale-web-token');
    const storage = new TokenStorageService();
    expect(storage.get()).toBeNull();
    storage.set('native-token');
    expect(storage.get()).toBe('native-token');
    expect(sessionStorage.getItem('bs.access_token')).toBe('stale-web-token');
    expect(new TokenStorageService().get()).toBeNull();
    storage.clear();
    expect(storage.hasToken()).toBe(false);
  });
});
