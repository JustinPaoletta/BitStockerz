import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// An isolated, ephemeral research server. Never imports production credentials.
const root = new URL("../../", import.meta.url);
let config;
try {
  config = JSON.parse(
    readFileSync(new URL("apps/web/.ios-prototype.local.json", root), "utf8"),
  );
} catch {
  throw new Error("Run npm run ios:prepare first.");
}
const simulator = config.mode === "simulator";
if (!["device", "simulator"].includes(config.mode))
  throw new Error("Invalid prototype mode");
console.log(
  "Synthetic development data; accounts and research are lost when this server restarts.",
);
console.log(
  simulator
    ? "Simulator-only email fallback enabled. Listening on localhost:4310."
    : "Passkey-only mode. Forward your dedicated HTTPS prototype origin to localhost:4310.",
);
const child = spawn("npm", ["--prefix", "apps/api", "run", "start:dev"], {
  cwd: fileURLToPath(root),
  stdio: "inherit",
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    BITSTOCKERZ_SKIP_ENV_FILE: "true",
    NODE_ENV: "development",
    PORT: "4310",
    HOST: "127.0.0.1",
    DATABASE_URL: "",
    PRIVATE_BETA_ENABLED: "false",
    PRIVATE_BETA_PROXY_KEY: "",
    PRIVATE_BETA_MONITOR_KEY: "",
    AUTH_DEV_EMAIL_ENABLED: String(simulator),
    AUTH_LEGACY_WEBAUTHN_ENABLED: "false",
    WEBAUTHN_RP_ID: simulator ? "localhost" : config.rpId,
    WEBAUTHN_ALLOWED_ORIGINS: simulator
      ? "http://localhost:4200,http://127.0.0.1:4200"
      : `https://${config.rpId}`,
    CORS_ALLOWED_ORIGINS:
      "capacitor://localhost,http://localhost:4200,http://127.0.0.1:4200",
    INGESTION_SCHEDULER_ENABLED: "false",
    MARKET_DATA_LIVE_ENABLED: "false",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    APPLE_CLIENT_ID: "",
    APPLE_PRIVATE_KEY: "",
    AI_PROVIDER: "stub",
    LOG_TO_FILE: "false",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
