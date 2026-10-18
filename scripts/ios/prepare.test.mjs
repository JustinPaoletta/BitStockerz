import assert from "node:assert/strict";
import { test } from "node:test";
import { settings } from "./prepare.mjs";

test("simulator is pinned to the local ephemeral API", () => {
  assert.equal(settings([]).apiOrigin, "http://localhost:4310");
  assert.throws(() => settings(["--api-origin", "http://192.168.1.1:4310"]));
});
test("device config requires HTTPS, a real RP, and safe build setting values", () => {
  const valid = [
    "--mode",
    "device",
    "--api-origin",
    "https://api.example.com",
    "--rp-id",
    "login.example.com",
  ];
  assert.equal(settings(valid).rpId, "login.example.com");
  for (const origin of [
    "http://api.example.com",
    "https://u:pw@api.example.com",
    "https://api.example.com/api",
    "https://api.example.com/?secret=1",
  ]) {
    assert.throws(() => settings([...valid, "--api-origin", origin]));
  }
  for (const rp of [
    "localhost",
    "passkeys.invalid",
    "example.com\nOTHER_SETTING = YES",
    "*.example.com",
  ]) {
    assert.throws(() => settings([...valid, "--rp-id", rp]));
  }
  assert.throws(() => settings([...valid, "--team-id", "bad-team"]));
  assert.throws(() =>
    settings([...valid, "--bundle-id", "com.example\nFOO=bar"]),
  );
});

test("Personal Team demo cannot target production and uses a distinct app without a passkey RP", () => {
  const args = [
    "--mode",
    "device-demo",
    "--api-origin",
    "https://test-only.trycloudflare.com",
  ];
  const config = settings(args);
  assert.equal(config.rpId, "passkeys.invalid");
  assert.equal(config.bundleId, "com.bitstockerz.research.demo");
  assert.throws(() =>
    settings([...args, "--bundle-id", "com.bitstockerz.research"]),
  );
  for (const origin of [
    "https://production.example.com",
    "https://trycloudflare.com",
    "https://evil.trycloudflare.com.example.com",
    "http://test-only.trycloudflare.com",
  ]) {
    assert.throws(() => settings([...args, "--api-origin", origin]));
  }
});
