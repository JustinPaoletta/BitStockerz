import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rootCertificates } from "node:tls";
import {
  checkDeployConfig,
  checkVercelProtection,
} from "./check-deploy-config.mjs";
const configured = {
  DATABASE_URL: "mysql://operator@db.example.test:3306/bitstockerz?ssl=true",
  DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString("base64"),
  FLY_API_TOKEN: "fixture-fly",
  API_BASE_URL: "https://api.example.test",
  FLY_APP_NAME: "example-api",
  VERCEL_TOKEN: "fixture-vercel",
  VERCEL_ORG_ID: "example-team",
  VERCEL_PROJECT_ID: "example-project",
};
test("production requires all-deployment protection and project-scoped token access", async () => {
  assert.deepEqual(
    await checkVercelProtection(configured, async (url, options) => {
      assert.equal(url.hostname, "api.vercel.com");
      assert.equal(url.searchParams.get("teamId"), configured.VERCEL_ORG_ID);
      assert.equal(
        options.headers.authorization,
        `Bearer ${configured.VERCEL_TOKEN}`,
      );
      assert.equal(options.redirect, "error");
      return Response.json({ ssoProtection: { deploymentType: "all" } });
    }),
    [],
  );
  for (const project of [
    {},
    { ssoProtection: { deploymentType: "all_except_custom_domains" } },
  ]) {
    assert.deepEqual(
      await checkVercelProtection(configured, async () =>
        Response.json(project),
      ),
      ["VERCEL_ALL_DEPLOYMENTS_PROTECTION_REQUIRED"],
    );
  }
  for (const request of [
    async () => new Response("", { status: 403 }),
    async () => {
      throw new Error("secret");
    },
  ]) {
    assert.deepEqual(await checkVercelProtection(configured, request), [
      "VERCEL_PROJECT_ACCESS_FAILED",
    ]);
  }
});
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
  assert.equal(JSON.parse(missing.stdout).issues.length, 8);
  const success = spawnSync(process.execPath, [script.pathname], {
    env: configured,
    encoding: "utf8",
  });
  assert.equal(success.status, 0);
});
test("rejects malformed database certificates without echoing their value", () => {
  for (const value of [
    "private-data",
    Buffer.from(
      "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----",
    ).toString("base64"),
  ]) {
    assert.deepEqual(
      checkDeployConfig({ ...configured, DATABASE_CA_CERT_BASE64: value })
        .issues,
      ["DATABASE_CA_CERT_BASE64_INVALID"],
    );
  }
});
