import { Capacitor } from '@capacitor/core';
import { nativeBridge } from '../native/bridge';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

export function registerPasskey(options: PublicKeyCredentialCreationOptionsJSON) {
  return Capacitor.getPlatform() === 'ios'
    ? nativeBridge.register({ options })
    : startRegistration({ optionsJSON: options });
}

export function authenticatePasskey(options: PublicKeyCredentialRequestOptionsJSON) {
  return Capacitor.getPlatform() === 'ios'
    ? nativeBridge.authenticate({ options })
    : startAuthentication({ optionsJSON: options });
}
