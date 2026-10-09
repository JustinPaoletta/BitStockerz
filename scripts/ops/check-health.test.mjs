import test from "node:test";
import assert from "node:assert/strict";
import { checkHealth } from "./check-health.mjs";
const healthy = (url) =>
  Promise.resolve(
    Response.json(
      url.pathname.endsWith("/live")
        ? { status: "ok" }
        : url.pathname.endsWith("/ready")
          ? { ready: true, checks: { database: { status: "up" } } }
          : {
              status: "ok",
              source: "database",
              provider: { circuit: "closed" },
              series: [{ stale: false }],
            },
    ),
  );
test("requires a real database and healthy, fresh market data", async () => {
  assert.equal(
    (await checkHealth("https://api.example.com/api", healthy)).healthy,
    true,
  );
  const failing = () =>
    Promise.resolve(
      Response.json({
        status: "degraded",
        ready: false,
        source: "seed",
        series: [{ stale: true }],
      }),
    );
  assert.deepEqual(
    (await checkHealth("https://api.example.com/api", failing)).issues,
    ["API_LIVENESS", "DEPENDENCY_READINESS", "MARKET_DATA"],
  );
});
test("fails closed for network outages, HTTP errors, and unsafe URLs", async () => {
  for (const request of [
    () => Promise.reject(new Error("private failure")),
    () => Promise.resolve(new Response("", { status: 503 })),
  ])
    assert.equal(
      (await checkHealth("https://api.example.com/api", request)).healthy,
      false,
    );
  await assert.rejects(checkHealth("https://secret@example.com/api", healthy));
});

test("supports the deployment secret origin and rejects missing market series", async () => {
  const paths = [];
  await checkHealth("https://api.example.com", (url) => {
    paths.push(url.pathname);
    return healthy(url);
  });
  assert.deepEqual(paths, [
    "/api/health/live",
    "/api/health/ready",
    "/api/market-data/health",
  ]);
  const request = (url) =>
    url.pathname.endsWith("health")
      ? Promise.resolve(Response.json({ status: "ok", source: "database" }))
      : healthy(url);
  assert.deepEqual(
    (await checkHealth("https://api.example.com", request)).issues,
    ["MARKET_DATA"],
  );
});

test("deployment smoke requires persistent readiness without requiring launch data", async () => {
  const paths = [];
  const request = (url) => {
    paths.push(url.pathname);
    return healthy(url);
  };
  assert.equal(
    (
      await checkHealth("https://api.example.com", request, {
        marketData: false,
      })
    ).healthy,
    true,
  );
  assert.deepEqual(paths, ["/api/health/live", "/api/health/ready"]);
  assert.deepEqual(
    (
      await checkHealth(
        "https://api.example.com",
        (url) =>
          url.pathname.endsWith("/ready")
            ? Promise.resolve(
                Response.json({
                  ready: true,
                  checks: { database: { status: "disabled" } },
                }),
              )
            : healthy(url),
        { marketData: false },
      )
    ).issues,
    ["DEPENDENCY_READINESS"],
  );
});

test("malformed JSON and redirects fail with sanitized issue codes", async () => {
  for (const request of [
    () => Promise.resolve(new Response("private upstream diagnostic")),
    () =>
      Promise.resolve(
        new Response("", {
          status: 302,
          headers: { location: "https://other.example.com" },
        }),
      ),
  ])
    assert.deepEqual(
      (
        await checkHealth("https://api.example.com", request, {
          marketData: false,
        })
      ).issues,
      ["API_LIVENESS", "DEPENDENCY_READINESS"],
    );
});
