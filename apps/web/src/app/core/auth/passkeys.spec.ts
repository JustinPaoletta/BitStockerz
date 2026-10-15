import { Capacitor } from '@capacitor/core';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { authenticatePasskey, registerPasskey } from './passkeys';

const native = vi.hoisted(() => ({ register: vi.fn(), authenticate: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: vi.fn() },
  registerPlugin: () => native,
}));
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

describe('passkey transport', () => {
  afterEach(() => vi.resetAllMocks());
  it('passes the original server challenge to iOS and returns the native assertion unchanged', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    const options = {
      challenge: 'challenge',
      rpId: 'login.example.com',
    } as PublicKeyCredentialRequestOptionsJSON;
    const response = { id: 'credential', response: { signature: 'signed' } };
    native.authenticate.mockResolvedValue(response);
    expect(await authenticatePasskey(options)).toBe(response);
    expect(native.authenticate).toHaveBeenCalledWith({ options });
    expect(startAuthentication).not.toHaveBeenCalled();
  });
  it('does not silently fall back after a cancelled native request', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    native.register.mockRejectedValue(new Error('Cancelled'));
    await expect(registerPasskey({} as PublicKeyCredentialCreationOptionsJSON)).rejects.toThrow(
      'Cancelled',
    );
    expect(startRegistration).not.toHaveBeenCalled();
  });
  it('preserves browser WebAuthn', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    const options = { challenge: 'challenge' } as PublicKeyCredentialRequestOptionsJSON;
    await authenticatePasskey(options);
    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
    expect(native.authenticate).not.toHaveBeenCalled();
  });
});
