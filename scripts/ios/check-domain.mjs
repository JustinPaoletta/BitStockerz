import { readFileSync } from "node:fs";

const config = JSON.parse(
  readFileSync(
    new URL("../../apps/web/.ios-prototype.local.json", import.meta.url),
    "utf8",
  ),
);
const demo = config.mode === "device-demo";
if (!demo && (config.mode !== "device" || !config.teamId)) {
  throw new Error("Run ios:prepare in device mode with --team-id first.");
}
const options = { redirect: "manual", signal: AbortSignal.timeout(15000) };
if (!demo) {
  const response = await fetch(
    `https://${config.rpId}/.well-known/apple-app-site-association`,
    options,
  );
  if (
    response.status !== 200 ||
    !response.headers.get("content-type")?.includes("application/json")
  ) {
    throw new Error(
      `Association file must return public HTTP 200 application/json without redirects; received ${response.status}.`,
    );
  }
  const association = await response.json();
  const app = `${config.teamId}.${config.bundleId}`;
  if (!association.webcredentials?.apps?.includes(app))
    throw new Error(`Association file is missing ${app}`);
  console.log("Public Apple association file matches this app.");
}
if (demo && !/^[a-f0-9]{64}$/.test(config.demoAccessKey ?? ""))
  throw new Error("Missing demo access key");
const preflight = await fetch(
  `${config.apiOrigin}/api/auth/webauthn/login/options`,
  {
    method: "OPTIONS",
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
    headers: {
      Origin: "capacitor://localhost",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": demo
        ? "authorization,content-type,x-bitstockerz-beta-key"
        : "authorization,content-type",
    },
  },
);
if (
  !preflight.ok ||
  preflight.headers.get("access-control-allow-origin") !==
    "capacitor://localhost"
) {
  throw new Error(
    "API preflight failed. Configure CORS_ALLOWED_ORIGINS for capacitor://localhost and check the private-beta gateway.",
  );
}
const allowed =
  preflight.headers
    .get("access-control-allow-headers")
    ?.toLowerCase()
    .split(",")
    .map((value) => value.trim()) ?? [];
if (
  !allowed.includes("authorization") ||
  !allowed.includes("content-type") ||
  (demo && !allowed.includes("x-bitstockerz-beta-key"))
)
  throw new Error("API preflight does not allow the required headers.");
const health = await fetch(`${config.apiOrigin}/api/health/ready`, {
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
if (!health.ok || !(await health.json()).ready)
  throw new Error("API readiness check failed.");
if (demo) {
  const blocked = await fetch(`${config.apiOrigin}/api/auth/providers`, {
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  if (blocked.status !== 401)
    throw new Error(
      "Demo API must reject requests without its disposable access key",
    );
}
const providers = await fetch(`${config.apiOrigin}/api/auth/providers`, {
  headers: demo ? { "x-bitstockerz-beta-key": config.demoAccessKey } : {},
  redirect: "manual",
  signal: AbortSignal.timeout(15000),
});
if (
  !providers.ok ||
  !providers.headers.get("content-type")?.includes("application/json")
) {
  throw new Error(
    "The API authentication routes are not reachable from the app. Check deployment protection and the private-beta gateway; do not embed its key.",
  );
}
console.log(
  "API readiness, authentication-route access, and native CORS checks passed.",
);
console.log(
  demo
    ? "Personal Team demo access gate verified. Native passkeys are deferred."
    : "Now verify signing, Apple domain association, and Face ID on the iPhone. These HTTP checks do not prove native passkey login.",
);
