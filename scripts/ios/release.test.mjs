import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings, environmentSource } from "./prepare.mjs";
import { publicBuild, validateRelease } from "./build-config.mjs";
import { verifyArtifact, verifyEnvironment } from "./check-release.mjs";

const config = {
  mode: "production",
  apiOrigin: "https://api.bitstockerz-fixture.com",
  rpId: "login.bitstockerz-fixture.com",
  bundleId: "com.bitstockerz.research",
  teamId: "ABCDEFGHIJ",
  version: "0.1.0",
  buildNumber: "12",
  sourceRevision: "a".repeat(40),
  sourceDirty: false,
};
const cap = {
  appId: config.bundleId,
  appName: "BitStockerz",
  server: { hostname: "localhost", iosScheme: "capacitor" },
};
const info = {
  CFBundleIdentifier: config.bundleId,
  CFBundleDisplayName: "BitStockerz",
  CFBundleShortVersionString: config.version,
  CFBundleVersion: config.buildNumber,
  PasskeyRelyingParty: config.rpId,
  BitStockerzBuildChannel: config.mode,
  BitStockerzBuildFingerprint: publicBuild(config).fingerprint,
};
const args = [
  "--mode",
  "production",
  "--api-origin",
  config.apiOrigin,
  "--rp-id",
  config.rpId,
  "--team-id",
  config.teamId,
  "--version",
  config.version,
  "--build-number",
  config.buildNumber,
];

test("staging and production require explicit identity/version inputs", () => {
  assert.equal(settings(args).bundleId, config.bundleId);
  assert.equal(
    settings([...args, "--mode", "staging"]).bundleId,
    "com.bitstockerz.research.staging",
  );
  for (const key of ["--team-id", "--version", "--build-number"]) {
    const a = [...args];
    a.splice(a.indexOf(key), 2);
    assert.throws(() => settings(a));
  }
  assert.throws(() =>
    settings([...args, "--bundle-id", "com.bitstockerz.research.demo"]),
  );
  assert.throws(() => settings(["--version", "1.0.0\nEVIL=YES"]));
});

test("release rejects temporary, private, placeholder, and credential-bearing endpoints", () => {
  for (const origin of [
    "http://api.bitstockerz-fixture.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://api.local",
    "https://foo.test",
    "https://api.example.com",
    "https://random.trycloudflare.com",
    "https://foo.ngrok-free.app",
    "https://user:password@api.bitstockerz-fixture.com",
    "https://api.bitstockerz-fixture.com/api",
    "https://api.bitstockerz-fixture.com?key=test",
  ]) {
    assert.throws(() => settings([...args, "--api-origin", origin]), origin);
  }
  for (const rp of [
    "passkeys.invalid",
    "login.localhost",
    "login.example.com",
    "random.trycloudflare.com",
  ])
    assert.throws(() => settings([...args, "--rp-id", rp]));
});

test("release rejects development mode, demo keys, dirty production source and invalid build strings", () => {
  for (const patch of [
    { mode: "device-demo" },
    { demoAccessKey: "b".repeat(64) },
    { prototypeAccessKey: "key" },
    { sourceDirty: true },
    { sourceRevision: "unknown" },
    { buildNumber: "0" },
    { buildNumber: "1;EVIL" },
    { buildNumber: "10000" },
    { version: "0.1" },
    { version: "1.0.0-beta" },
  ])
    assert.throws(() => validateRelease({ ...config, ...patch }));
  assert.doesNotThrow(() =>
    validateRelease({
      ...config,
      mode: "staging",
      bundleId: "com.bitstockerz.research.staging",
      sourceDirty: true,
    }),
  );
});

test("public build identity is deterministic and excludes disposable secrets", () => {
  assert.deepEqual(
    publicBuild(config),
    publicBuild({ ...config, demoAccessKey: "secret", anything: "secret" }),
  );
  assert.notEqual(
    publicBuild(config).fingerprint,
    publicBuild({ ...config, buildNumber: "13" }).fingerprint,
  );
  assert.notEqual(
    publicBuild(config).fingerprint,
    publicBuild({ ...config, sourceRevision: "c".repeat(40) }).fingerprint,
  );
});

test("artifact inspection detects stale JavaScript, demo credentials, remote navigation and wrong plist identity", () => {
  const folder = mkdtempSync(join(tmpdir(), "bitstockerz-artifact-"));
  try {
    const build = publicBuild(config);
    writeFileSync(join(folder, "ios-build.local.json"), JSON.stringify(build));
    writeFileSync(
      join(folder, "main.js"),
      `document.documentElement.dataset.bitstockerzBuild="${build.fingerprint}";`,
    );
    assert.equal(
      verifyArtifact(folder, config, { capacitor: cap, info }).files.length,
      2,
    );
    assert.throws(() =>
      verifyArtifact(folder, { ...config, buildNumber: "13" }),
    );
    for (const server of [
      { ...cap.server, url: "https://evil.com" },
      { ...cap.server, allowNavigation: ["*"] },
      { ...cap.server, cleartext: true },
    ])
      assert.throws(() =>
        verifyArtifact(folder, config, { capacitor: { ...cap, server } }),
      );
    for (const key of Object.keys(info))
      assert.throws(() =>
        verifyArtifact(folder, config, { info: { ...info, [key]: "wrong" } }),
      );
    writeFileSync(
      join(folder, "main.js"),
      `"${build.fingerprint}";const environment={prototypeAccessKey:"disposable-key"};`,
    );
    assert.throws(() => verifyArtifact(folder, config));
    writeFileSync(join(folder, "main.js"), 'console.log("stale demo bundle");');
    assert.throws(() => verifyArtifact(folder, config));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a clean checkout generates repeatable production identity without demo credentials", async () => {
  const { mkdirSync, readFileSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");
  const { prepare } = await import("./prepare.mjs");
  const folder = mkdtempSync(join(tmpdir(), "bitstockerz-prepare-"));
  try {
    const git = (...a) =>
      execFileSync("git", a, { cwd: folder, stdio: "pipe" });
    git("init");
    writeFileSync(join(folder, ".gitignore"), "apps/web/\nartifacts/\n");
    git("add", ".gitignore");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-m",
      "fixture",
    );
    for (const path of [
      "apps/web/src/environments",
      "apps/web/ios/App/App",
      "apps/web/public",
    ])
      mkdirSync(join(folder, path), { recursive: true });
    prepare(args, { root: folder });
    const first = readFileSync(
      join(folder, "apps/web/.ios-prototype.local.json"),
      "utf8",
    );
    prepare(args, { root: folder });
    assert.equal(
      readFileSync(join(folder, "apps/web/.ios-prototype.local.json"), "utf8"),
      first,
    );
    assert.equal(JSON.parse(first).sourceDirty, false);
    assert.equal(JSON.parse(first).demoAccessKey, undefined);
    const env = readFileSync(
      join(folder, "apps/web/src/environments/environment.ios.local.ts"),
      "utf8",
    );
    assert.match(env, /"nativeMode": "device"/);
    assert.doesNotMatch(env, /prototypeAccessKey":/);
    const native = readFileSync(
      join(folder, "apps/web/ios/App/App/Prototype.xcconfig"),
      "utf8",
    );
    assert.match(native, /BITSTOCKERZ_VERSION = 0.1.0/);
    assert.match(native, /BITSTOCKERZ_BUILD_NUMBER = 12/);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("sync rejects edited or stale generated environments before building", () => {
  const source = environmentSource(config);
  assert.doesNotThrow(() => verifyEnvironment(config, source));
  assert.throws(() =>
    verifyEnvironment(
      config,
      source.replace('"nativeMode": "device"', '"nativeMode": "device-demo"'),
    ),
  );
  assert.throws(() =>
    verifyEnvironment({ ...config, buildNumber: "13" }, source),
  );
});

test(
  "Xcode Release guard rejects demo and stale native settings",
  { skip: process.platform !== "darwin" },
  async () => {
    const { mkdirSync } = await import("node:fs");
    const { execFileSync, spawnSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const script = fileURLToPath(new URL("./check-xcode.sh", import.meta.url));
    const folder = mkdtempSync(join(tmpdir(), "bitstockerz-xcode-"));
    try {
      const git = (...args) =>
        execFileSync("git", args, {
          cwd: folder,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      git("init");
      writeFileSync(join(folder, ".gitignore"), "apps/\n");
      git("add", ".gitignore");
      git(
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "-m",
        "fixture",
      );
      const source = join(folder, "apps/web/ios/App");
      const output = join(source, "App/public");
      mkdirSync(output, { recursive: true });
      const c = {
        ...config,
        mode: "staging",
        bundleId: "com.bitstockerz.research.staging",
        sourceRevision: git("rev-parse", "HEAD").trim(),
      };
      const build = publicBuild(c);
      writeFileSync(
        join(output, "ios-build.local.json"),
        JSON.stringify(build),
      );
      writeFileSync(join(output, "main.js"), JSON.stringify(build.fingerprint));
      const env = {
        ...process.env,
        SRCROOT: source,
        CONFIGURATION: "Release",
        CODE_SIGN_ENTITLEMENTS: "App/App.entitlements",
        BITSTOCKERZ_CHANNEL: c.mode,
        PRODUCT_BUNDLE_IDENTIFIER: c.bundleId,
        DEVELOPMENT_TEAM: c.teamId,
        BITSTOCKERZ_RP_ID: c.rpId,
        MARKETING_VERSION: c.version,
        CURRENT_PROJECT_VERSION: c.buildNumber,
        BITSTOCKERZ_FINGERPRINT: build.fingerprint,
      };
      const run = (patch = {}) =>
        spawnSync("/bin/sh", [script], {
          env: { ...env, ...patch },
          encoding: "utf8",
        });
      assert.equal(run().status, 0);
      for (const patch of [
        { BITSTOCKERZ_CHANNEL: "device-demo" },
        { MARKETING_VERSION: "9.9.9" },
        { CODE_SIGN_ENTITLEMENTS: "App/Demo.entitlements" },
        { BITSTOCKERZ_FINGERPRINT: "stale" },
      ])
        assert.notEqual(run(patch).status, 0);
      writeFileSync(
        join(output, "ios-build.local.json"),
        JSON.stringify({ ...build, mode: "device-demo" }),
      );
      assert.notEqual(run().status, 0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
