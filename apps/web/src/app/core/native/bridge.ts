import { registerPlugin } from '@capacitor/core';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';

interface NativeBridge {
  shareText(options: { filename: string; contents: string }): Promise<void>;
  register(options: {
    options: PublicKeyCredentialCreationOptionsJSON;
  }): Promise<RegistrationResponseJSON>;
  authenticate(options: {
    options: PublicKeyCredentialRequestOptionsJSON;
  }): Promise<AuthenticationResponseJSON>;
}
export const nativeBridge = registerPlugin<NativeBridge>('BitStockerzPasskeys');
