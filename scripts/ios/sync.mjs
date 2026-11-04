import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  root,
  verifyArtifact,
  checkPreparedArtifact,
  verifySource,
  verifyEnvironment,
} from "./check-release.mjs";
import { releaseModes, validateRelease } from "./build-config.mjs";

try {
  const config = JSON.parse(
    readFileSync(resolve(root, "apps/web/.ios-prototype.local.json"), "utf8"),
  );
  const release = releaseModes.includes(config.mode);
  if (process.argv.includes("--release") || release) validateRelease(config);
  if (release) verifySource(config);
  verifyEnvironment(
    config,
    readFileSync(
      resolve(root, "apps/web/src/environments/environment.ios.local.ts"),
      "utf8",
    ),
  );
  const cwd = resolve(root, "apps/web");
  function run(args) {
    const result = spawnSync("npm", args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NG_BUILD_CACHE_STORE: "sqlite" },
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`iOS sync step failed (${result.status}).`);
  }
  run(["run", "build", "--", "--configuration", "ios"]);
  verifyArtifact(resolve(cwd, "dist/web/browser"), config, { release });
  run(["exec", "--", "cap", "sync", "ios"]);
  const result = checkPreparedArtifact(resolve(cwd, "ios/App/App/public"), {
    release,
  });
  console.log(
    `Synchronized build ${result.build.fingerprint}; evidence saved under artifacts/ios-build/.`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
