import type { NativeBuildInfo } from '../app/core/native/build-info';

export const environment = {
  nativeBuild: undefined as NativeBuildInfo | undefined,
  production: false,
  /** Empty uses same-origin `/api` via the Angular dev proxy. */
  nativeMode: 'web' as 'web' | 'simulator' | 'device' | 'device-demo',
  apiBaseUrl: '',
  prototypeAccessKey: undefined as string | undefined,
};
