import { pathToFileURL } from "node:url";
/** Never prints provider responses, access keys or credential-bearing URLs. */
export async function checkHealth(
  base,
  request = fetch,
  { marketData = true, monitorKey } = {},
) {
  const parsed = new URL(base);
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (monitorKey && parsed.protocol !== "https:") ||
    !["http:", "https:"].includes(parsed.protocol)
  )
    throw new Error(
      "Use a plain API base URL without credentials, query, or fragment.",
    );
  const issues = [];
  for (const [path, name] of [
    ["health/live", "API_LIVENESS"],
    ["health/ready", "DEPENDENCY_READINESS"],
    ...(marketData ? [["market-data/health", "MARKET_DATA"]] : []),
  ]) {
    try {
      const response = await request(
        new URL(
          `${parsed.pathname.replace(/\/$/, "").replace(/\/api$/, "")}/api/${path}`,
          parsed.origin,
        ),
        {
          signal: AbortSignal.timeout(10000),
          redirect: "error",
          ...(name === "MARKET_DATA" && monitorKey
            ? { headers: { "x-bitstockerz-monitor-key": monitorKey } }
            : {}),
        },
      );
      if (!response.ok) {
        issues.push(name);
        continue;
      }
      const body = await response.json();
      if (name === "API_LIVENESS" && body.status !== "ok") issues.push(name);
      if (
        name === "DEPENDENCY_READINESS" &&
        (body.ready !== true || body.checks?.database?.status !== "up")
      )
        issues.push(name);
      if (
        name === "MARKET_DATA" &&
        (body.status !== "ok" ||
          body.source !== "database" ||
          body.provider?.circuit === "open" ||
          !Array.isArray(body.series) ||
          body.series.length === 0 ||
          body.series.some((series) => series.stale !== false))
      )
        issues.push(name);
    } catch {
      issues.push(name);
    }
  }
  return {
    checked_at: new Date().toISOString(),
    healthy: issues.length === 0,
    issues,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const deployment = process.argv.includes("--deployment");
    const result = await checkHealth(process.env.API_BASE_URL ?? "", fetch, {
      marketData: !deployment,
      monitorKey: process.env.PRIVATE_BETA_MONITOR_KEY,
    });
    console.log(JSON.stringify(result));
    if (!result.healthy) process.exitCode = 1;
  } catch {
    console.error("Set API_BASE_URL to the API origin, without credentials.");
    process.exitCode = 2;
  }
}
