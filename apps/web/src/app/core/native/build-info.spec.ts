import { assertNativeBuild, NativeBuildInfo } from './build-info';

describe('native release startup', () => {
  const nativeBuild: NativeBuildInfo = {
    mode: 'production',
    apiOrigin: 'https://api.bitstockerz-fixture.com',
    rpId: 'login.bitstockerz-fixture.com',
    bundleId: 'com.bitstockerz.research',
    teamId: 'ABCDEFGHIJ',
    version: '0.1.0',
    buildNumber: '1',
    sourceRevision: 'a'.repeat(40),
    sourceDirty: false,
    fingerprint: 'BSIOS_' + 'b'.repeat(64),
  };
  const valid = {
    production: true,
    nativeMode: 'device',
    apiBaseUrl: nativeBuild.apiOrigin,
    nativeBuild,
  };
  it('fails before bootstrap when a release would activate test login or a mismatched endpoint', () => {
    expect(assertNativeBuild(valid)).toBe(nativeBuild.fingerprint);
    for (const change of [
      { production: false },
      { nativeMode: 'device-demo' },
      { prototypeAccessKey: 'test-key' },
      { apiBaseUrl: 'https://wrong.bitstockerz-fixture.com' },
    ])
      expect(() => assertNativeBuild({ ...valid, ...change })).toThrow();
  });
  it('preserves browser and existing prototype startup', () => {
    expect(
      assertNativeBuild({ production: false, nativeMode: 'web', apiBaseUrl: '' }),
    ).toBeUndefined();
  });
});
