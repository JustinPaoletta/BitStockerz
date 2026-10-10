import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bitstockerz.research',
  appName: 'BitStockerz',
  webDir: 'dist/web/browser',
  // Always bundle the UI. Never load an arbitrary remote site into the native bridge.
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: { contentInset: 'never' },
};
export default config;
