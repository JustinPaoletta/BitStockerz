/** Public build identity; never include credentials here. */
export interface NativeBuildInfo {
  mode: string;
  apiOrigin: string;
  rpId: string;
  bundleId: string;
  teamId: string | null;
  version: string;
  buildNumber: string;
  sourceRevision: string;
  sourceDirty: boolean;
  fingerprint: string;
}

export function assertNativeBuild(config: {
  production: boolean;
  nativeMode: string;
  apiBaseUrl: string;
  prototypeAccessKey?: string;
  nativeBuild?: NativeBuildInfo;
}): string | undefined {
  const build = config.nativeBuild;
  if (!build) return undefined;
  if (['staging', 'production'].includes(build.mode)) {
    if (
      !config.production ||
      config.nativeMode !== 'device' ||
      config.prototypeAccessKey ||
      config.apiBaseUrl !== build.apiOrigin ||
      !build.apiOrigin.startsWith('https://') ||
      !/^BSIOS_[a-f0-9]{64}$/.test(build.fingerprint)
    ) {
      throw new Error('Invalid native release configuration. Rebuild the app.');
    }
  }
  return build.fingerprint;
}
