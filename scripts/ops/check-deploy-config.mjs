import { pathToFileURL } from "node:url";
import { createSecureContext } from "node:tls";
import { X509Certificate } from "node:crypto";

// Only names and fixed issue codes leave this process, never secret values.
export function checkDeployConfig(env) {
  const required = [
    "DATABASE_URL",
    "DATABASE_CA_CERT_BASE64",
    "FLY_API_TOKEN",
    "API_BASE_URL",
    "FLY_APP_NAME",
    "VERCEL_TOKEN",
    "VERCEL_ORG_ID",
    "VERCEL_PROJECT_ID",
  ];
  const issues = required
    .filter((key) => !env[key]?.trim())
    .map((key) => `${key}_MISSING`);
  if (env.DATABASE_CA_CERT_BASE64?.trim()) {
    try {
      const ca = Buffer.from(env.DATABASE_CA_CERT_BASE64, "base64");
      if (!ca.toString("utf8").includes("-----BEGIN CERTIFICATE-----"))
        throw new Error();
      new X509Certificate(ca);
      createSecureContext({ ca });
    } catch {
      issues.push("DATABASE_CA_CERT_BASE64_INVALID");
    }
  }
  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (
        url.protocol !== "mysql:" ||
        !url.hostname ||
        !url.username ||
        url.pathname.length < 2 ||
        url.hash
      )
        issues.push("DATABASE_URL_INVALID");
    } catch {
      issues.push("DATABASE_URL_INVALID");
    }
  }
  if (env.API_BASE_URL?.trim()) {
    try {
      const url = new URL(env.API_BASE_URL);
      if (
        url.protocol !== "https:" ||
        !url.hostname ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== "/"
      )
        issues.push("API_BASE_URL_INVALID");
    } catch {
      issues.push("API_BASE_URL_INVALID");
    }
  }
  if (
    env.FLY_APP_NAME?.trim() &&
    !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(env.FLY_APP_NAME)
  )
    issues.push("FLY_APP_NAME_INVALID");
  return { configured: issues.length === 0, issues };
}
export async function checkVercelProtection(env, request = fetch) {
  try {
    const url = new URL(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}`,
    );
    url.searchParams.set("teamId", env.VERCEL_ORG_ID);
    const response = await request(url, {
      headers: { authorization: `Bearer ${env.VERCEL_TOKEN}` },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return ["VERCEL_PROJECT_ACCESS_FAILED"];
    const project = await response.json();
    if (project.ssoProtection?.deploymentType !== "all")
      return ["VERCEL_ALL_DEPLOYMENTS_PROTECTION_REQUIRED"];
    return [];
  } catch {
    return ["VERCEL_PROJECT_ACCESS_FAILED"];
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = checkDeployConfig(process.env);
  if (result.configured && process.argv.includes("--verify-protection")) {
    result.issues.push(...(await checkVercelProtection(process.env)));
    result.configured = result.issues.length === 0;
  }
  console.log(JSON.stringify(result));
  if (!result.configured) process.exitCode = 1;
}
