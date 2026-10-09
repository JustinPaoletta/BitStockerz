import { pathToFileURL } from "node:url";

// Only names and fixed issue codes leave this process, never secret values.
export function checkDeployConfig(env) {
  const required = [
    "DATABASE_URL",
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
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const result = checkDeployConfig(process.env);
  console.log(JSON.stringify(result));
  if (!result.configured) process.exitCode = 1;
}
