import { environmentSource } from "./prepare.mjs";
import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { publicBuild, validateRelease } from "./build-config.mjs";
import { parseArgs } from "node:util";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export function verifyArtifact(
  directory,
  config,
  { release = true, capacitor, info } = {},
) {
  if (release) validateRelease(config);
  const build = publicBuild(config);
  const actual = JSON.parse(
    readFileSync(join(directory, "ios-build.local.json"), "utf8"),
  );
  if (JSON.stringify(actual) !== JSON.stringify(build))
    throw new Error(
      "Artifact identity differs from the prepared configuration; rebuild and sync.",
    );
  const files = [];
  function visit(folder) {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      if (statSync(path).isDirectory()) visit(path);
      else files.push(path);
    }
  }
  visit(directory);
  const scripts = files
    .filter((path) => path.endsWith(".js"))
    .map((path) => readFileSync(path, "utf8"));
  if (!scripts.some((text) => text.includes(build.fingerprint)))
    throw new Error(
      "Compiled JavaScript is missing this build identity; stale or mismatched assets.",
    );
  if (
    release &&
    scripts.some((text) => /prototypeAccessKey\s*:\s*["'][^"']+["']/.test(text))
  )
    throw new Error("Compiled release contains a demo credential.");
  if (capacitor) {
    if (
      capacitor.appId !== config.bundleId ||
      capacitor.appName !== "BitStockerz" ||
      capacitor.server?.url ||
      capacitor.server?.cleartext ||
      (capacitor.server?.allowNavigation?.length ?? 0) > 0 ||
      capacitor.server?.hostname !== "localhost" ||
      capacitor.server?.iosScheme !== "capacitor"
    )
      throw new Error(
        "Capacitor configuration permits remote content or has the wrong app identity.",
      );
  }
  if (info) {
    for (const [key, expected] of Object.entries({
      CFBundleIdentifier: config.bundleId,
      CFBundleDisplayName: "BitStockerz",
      CFBundleShortVersionString: config.version,
      CFBundleVersion: config.buildNumber,
      PasskeyRelyingParty: config.rpId,
      BitStockerzBuildChannel: config.mode,
      BitStockerzBuildFingerprint: build.fingerprint,
    })) {
      if (info[key] !== expected)
        throw new Error(
          `Built app ${key} differs from the prepared configuration.`,
        );
    }
  }
  return {
    build,
    files: files.map((path) => ({
      path: relative(directory, path),
      sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    })),
  };
}

export function verifyEnvironment(config, text) {
  if (text !== environmentSource(config))
    throw new Error(
      "Generated environment was modified or is stale; run ios:prepare again.",
    );
}

export function verifySource(config) {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = Boolean(
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  );
  if (
    config.sourceRevision !== revision ||
    (config.mode === "production" && dirty)
  )
    throw new Error(
      "Source changed after preparation; commit production changes and run ios:prepare again.",
    );
}

export function checkPreparedArtifact(
  directory,
  { release = false, app } = {},
) {
  const config = JSON.parse(
    readFileSync(resolve(root, "apps/web/.ios-prototype.local.json"), "utf8"),
  );
  if (release) {
    verifySource(config);
    verifyEnvironment(
      config,
      readFileSync(
        resolve(root, "apps/web/src/environments/environment.ios.local.ts"),
        "utf8",
      ),
    );
  }
  const native = app ?? resolve(root, "apps/web/ios/App/App");
  const capacitor = JSON.parse(
    readFileSync(join(native, "capacitor.config.json"), "utf8"),
  );
  const info = app
    ? JSON.parse(
        execFileSync(
          "plutil",
          ["-convert", "json", "-o", "-", join(app, "Info.plist")],
          { encoding: "utf8" },
        ),
      )
    : undefined;
  const result = verifyArtifact(directory, config, {
    release,
    capacitor,
    info,
  });
  const out = resolve(root, "artifacts/ios-build", result.build.fingerprint);
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, app ? "app-evidence.json" : "sync-evidence.json"),
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  return result;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: { app: { type: "string" }, web: { type: "string" } },
    });
    const directory = values.app
      ? resolve(values.app, "public")
      : resolve(values.web ?? resolve(root, "apps/web/ios/App/App/public"));
    const result = checkPreparedArtifact(directory, {
      release: true,
      app: values.app,
    });
    console.log(
      `Verified ${result.build.mode} ${result.build.version} (${result.build.buildNumber}): ${result.build.fingerprint}`,
    );
    console.log(
      "Artifact checks do not prove signing, domain association, API access, or device acceptance.",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
