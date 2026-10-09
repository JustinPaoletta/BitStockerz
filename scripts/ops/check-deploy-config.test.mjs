import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { checkDeployConfig } from "./check-deploy-config.mjs";
const configured = {
  DATABASE_URL: "mysql://operator@db.example.test:3306/bitstockerz?ssl=true",
  FLY_API_TOKEN: "fixture-fly",
  API_BASE_URL: "https://api.example.test",
  FLY_APP_NAME: "example-api",
  VERCEL_TOKEN: "fixture-vercel",
  VERCEL_ORG_ID: "example-team",
  VERCEL_PROJECT_ID: "example-project",
};
test("requires all release settings before any migration", () => {
  assert.deepEqual(checkDeployConfig(configured), {
    configured: true,
    issues: [],
  });
  for (const key of Object.keys(configured)) {
    assert.deepEqual(checkDeployConfig({ ...configured, [key]: "  " }), {
      configured: false,
      issues: [`${key}_MISSING`],
    });
  }
});
test("rejects wrong database engines and incomplete database destinations", () => {
  for (const value of [
    "postgres://operator@db.example.test/app",
    "mysql://db.example.test",
    "mysql://operator@db.example.test/",
    "not-a-url",
  ])
    assert.deepEqual(
      checkDeployConfig({ ...configured, DATABASE_URL: value }).issues,
      ["DATABASE_URL_INVALID"],
    );
});
test("requires an HTTPS API origin and safe Fly app name", () => {
  for (const value of [
    "http://api.example.test",
    "https://private@api.example.test",
    "https://api.example.test/api",
    "https://api.example.test/?token=private",
    "https://api.example.test/#private",
    "bad",
  ])
    assert.deepEqual(
      checkDeployConfig({ ...configured, API_BASE_URL: value }).issues,
      ["API_BASE_URL_INVALID"],
    );
  assert.equal(
    checkDeployConfig({
      ...configured,
      API_BASE_URL: "https://api.example.test/",
    }).configured,
    true,
  );
  for (const value of ["--other-app", "app; command", "INVALID"])
    assert.deepEqual(
      checkDeployConfig({ ...configured, FLY_APP_NAME: value }).issues,
      ["FLY_APP_NAME_INVALID"],
    );
});
test("CLI fails without settings and never logs private values or parser errors", () => {
  const script = new URL("./check-deploy-config.mjs", import.meta.url);
  const failure = spawnSync(process.execPath, [script.pathname], {
    env: { ...configured, DATABASE_URL: "malformed-private-database-secret" },
    encoding: "utf8",
  });
  assert.equal(failure.status, 1);
  assert.deepEqual(JSON.parse(failure.stdout), {
    configured: false,
    issues: ["DATABASE_URL_INVALID"],
  });
  assert.equal(failure.stderr, "");
  assert.doesNotMatch(failure.stdout, /private|fixture|operator/);
  const missing = spawnSync(process.execPath, [script.pathname], {
    env: {},
    encoding: "utf8",
  });
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stdout).issues.length, 7);
  const success = spawnSync(process.execPath, [script.pathname], {
    env: configured,
    encoding: "utf8",
  });
  assert.equal(success.status, 0);
});
