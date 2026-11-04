import { createHash } from "node:crypto";

export const releaseModes = ["staging", "production"];
export function stableHost(host) {
  const labels = host.toLowerCase().split(".");
  return (
    labels.length > 1 &&
    /^[a-z]+$/.test(labels.at(-1)) &&
    labels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) &&
    !/(?:^|\.)(?:localhost|local|internal|lan|home|onion|invalid|test|example)$/.test(
      host,
    ) &&
    !/(?:^|\.)(?:example\.(?:com|net|org)|trycloudflare\.com|ngrok(?:-free)?\.(?:app|io|dev)|loca\.lt|localtunnel\.me)$/.test(
      host,
    )
  );
}
export function fingerprint(config) {
  return (
    "BSIOS_" + createHash("sha256").update(JSON.stringify(config)).digest("hex")
  );
}
export function publicBuild(config) {
  const result = Object.fromEntries(
    [
      "mode",
      "apiOrigin",
      "rpId",
      "bundleId",
      "teamId",
      "version",
      "buildNumber",
      "sourceRevision",
      "sourceDirty",
    ].map((k) => [k, config[k] ?? null]),
  );
  return { ...result, fingerprint: fingerprint(result) };
}
export function validateVersion(config) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(config.version ?? ""))
    throw new Error("Version must contain three numeric components.");
  if (!/^[1-9]\d{0,3}$/.test(config.buildNumber ?? ""))
    throw new Error("Build number must be an integer from 1 to 9999.");
}
export function validateRelease(config) {
  if (!releaseModes.includes(config.mode))
    throw new Error("Release requires staging or production mode.");
  const api = new URL(config.apiOrigin);
  if (
    api.protocol !== "https:" ||
    !stableHost(api.hostname) ||
    api.port ||
    api.username ||
    api.password ||
    api.pathname !== "/" ||
    api.search ||
    api.hash
  )
    throw new Error("Release API must be a stable public HTTPS origin.");
  if (!stableHost(config.rpId))
    throw new Error("Release requires a stable passkey RP domain.");
  const bundle =
    config.mode === "production"
      ? "com.bitstockerz.research"
      : "com.bitstockerz.research.staging";
  if (config.bundleId !== bundle)
    throw new Error("Release app identity must match its channel.");
  if (!/^[A-Z0-9]{10}$/.test(config.teamId ?? ""))
    throw new Error("Release requires an Apple Team ID.");
  validateVersion(config);
  if (config.demoAccessKey || config.prototypeAccessKey)
    throw new Error("Release must not contain demo credentials.");
  if (!/^[a-f0-9]{40}$/.test(config.sourceRevision ?? ""))
    throw new Error("Release requires a source revision.");
  if (typeof config.sourceDirty !== "boolean")
    throw new Error("Release requires source cleanliness evidence.");
  if (config.mode === "production" && config.sourceDirty)
    throw new Error("Production requires committed source.");
}
