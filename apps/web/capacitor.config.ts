import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CapacitorConfig } from '@capacitor/cli';

const localPath = resolve(process.cwd(), '.ios-prototype.local.json');
const local = existsSync(localPath) ? JSON.parse(readFileSync(localPath, 'utf8')) : undefined;

const config: CapacitorConfig = {
  appId: local?.bundleId ?? 'com.bitstockerz.research',
  appName: 'BitStockerz',
  webDir: 'dist/web/browser',
  // Always bundle the UI. Never load an arbitrary remote site into the native bridge.
  server: { hostname: 'localhost', iosScheme: 'capacitor' },
  ios: { contentInset: 'never' },
};
export default config;
