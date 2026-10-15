import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Load apps/api/.env into process.env before AppConfigService reads configuration.
 * Checks process cwd first, then paths relative to this file (dist/src at runtime).
 */
export function loadEnvFile(): void {
  // The isolated iOS prototype must never import a developer's production credentials.
  if (process.env.BITSTOCKERZ_SKIP_ENV_FILE === 'true') return;
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/api/.env'),
    resolve(__dirname, '../../.env'),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path, override: false });
      return;
    }
  }
}

loadEnvFile();
