import { spawn } from "node:child_process";
import {
  chmod,
  link,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGzip } from "node:zlib";
import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const repository = fileURLToPath(new URL("../../", import.meta.url));

function optionValue(value) {
  if (/[\x00-\x1f\x7f]/.test(value))
    throw new Error("INVALID_DATABASE_SETTING");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function databaseSettings(env, localFixture = false) {
  let url;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("INVALID_DATABASE_URL");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (
    url.protocol !== "mysql:" ||
    !url.hostname ||
    !url.username ||
    url.hash ||
    !/^[A-Za-z0-9_]{1,64}$/.test(database)
  ) {
    throw new Error("INVALID_DATABASE_URL");
  }
  // This exception is only for disposable databases on the CI runner itself.
  if (
    localFixture &&
    (env.CI !== "true" ||
      url.hostname !== "127.0.0.1" ||
      !/^bitstockerz_backup_fixture_[a-z0-9_]+$/.test(database))
  ) {
    throw new Error("LOCAL_FIXTURE_ONLY");
  }
  if (!localFixture && !env.DATABASE_CA_CERT_PATH)
    throw new Error("DATABASE_CA_REQUIRED");
  const settings = [
    "[client]",
    "protocol=TCP",
    "connect-timeout=10",
    "default-character-set=utf8mb4",
    `host=${optionValue(url.hostname)}`,
    `port=${url.port || "3306"}`,
    `user=${optionValue(decodeURIComponent(url.username))}`,
    `password=${optionValue(decodeURIComponent(url.password))}`,
    `ssl-mode=${localFixture ? "REQUIRED" : "VERIFY_IDENTITY"}`,
    ...(!localFixture
      ? [`ssl-ca=${optionValue(resolve(env.DATABASE_CA_CERT_PATH))}`]
      : []),
  ];
  return { database, config: `${settings.join("\n")}\n` };
}

export async function externalOutput(output) {
  if (!output || !isAbsolute(output))
    throw new Error("ABSOLUTE_OUTPUT_REQUIRED");
  const parent = await realpath(dirname(output));
  const root = await realpath(repository);
  const fromRoot = relative(root, parent);
  if (
    fromRoot === "" ||
    (!fromRoot.startsWith(`..${sep}`) &&
      fromRoot !== ".." &&
      !isAbsolute(fromRoot))
  ) {
    throw new Error("OUTPUT_MUST_BE_OUTSIDE_REPOSITORY");
  }
  return join(parent, basename(output));
}

function childProcess(command, args, env, signal) {
  const child = spawn(command, args, {
    // Do not pass database URLs, cloud tokens or unrelated secrets to children.
    env: {
      PATH: env.PATH,
      LANG: "C.UTF-8",
      MYSQL_TEST_LOGIN_FILE: "/dev/null",
    },
    stdio: ["pipe", "pipe", "ignore"],
    signal,
  });
  const done = new Promise((resolveDone, reject) => {
    child.once("error", () => reject(new Error("BACKUP_TOOL_FAILED")));
    child.once("close", (code) =>
      code === 0 ? resolveDone() : reject(new Error("BACKUP_TOOL_FAILED")),
    );
  });
  // Attach a handler before wiring streams, including a failed spawn.
  done.catch(() => {});
  return { child, done };
}

export async function backupDatabase({
  output,
  recipient,
  localFixture = false,
  env = process.env,
  signal,
}) {
  if (!/^age1[0-9a-z]{58}$/.test(recipient || ""))
    throw new Error("AGE_PUBLIC_RECIPIENT_REQUIRED");
  const destination = await externalOutput(output);
  const { database, config } = databaseSettings(env, localFixture);
  if (!localFixture)
    new X509Certificate(await readFile(env.DATABASE_CA_CERT_PATH));
  const temporary = await mkdtemp(
    join(dirname(destination), ".bitstockerz-backup-"),
  );
  await chmod(temporary, 0o700);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  timeout.unref();
  const childSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  const children = [];
  try {
    const configPath = join(temporary, "mysql.cnf");
    const encrypted = join(temporary, "database.sql.gz.age");
    await writeFile(configPath, config, { mode: 0o600, flag: "wx" });
    const dump = childProcess(
      "mysqldump",
      [
        `--defaults-file=${configPath}`,
        "--single-transaction",
        "--quick",
        "--no-tablespaces",
        "--set-gtid-purged=OFF",
        "--hex-blob",
        "--skip-add-drop-table",
        "--skip-comments",
        "--column-statistics=0",
        database,
      ],
      env,
      childSignal,
    );
    children.push(dump);
    dump.child.stdin.end();
    const encrypt = childProcess(
      "age",
      ["--encrypt", "--recipient", recipient, "--output", encrypted],
      env,
      childSignal,
    );
    children.push(encrypt);
    encrypt.child.stdout.resume();
    await Promise.all([
      dump.done,
      encrypt.done,
      pipeline(dump.child.stdout, createGzip(), encrypt.child.stdin, {
        signal: childSignal,
      }),
    ]);
    await chmod(encrypted, 0o600);
    // Atomic publication without overwriting an existing backup or symlink.
    await link(encrypted, destination);
    return {
      status: "encrypted",
      bytes: (await stat(destination)).size,
      captured_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await Promise.allSettled(children.map(({ done }) => done));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const controller = new AbortController();
  process.once("SIGINT", () => controller.abort());
  process.once("SIGTERM", () => controller.abort());
  try {
    const { values } = parseArgs({
      options: {
        output: { type: "string" },
        recipient: { type: "string" },
        "local-fixture": { type: "boolean" },
      },
    });
    console.log(
      JSON.stringify(
        await backupDatabase({
          output: values.output,
          recipient: values.recipient,
          localFixture: values["local-fixture"],
          signal: controller.signal,
        }),
      ),
    );
  } catch {
    // Never print child stderr, connection settings, SQL or exception values.
    console.error(
      "Backup failed. Check MySQL/age installation, credentials, CA, public recipient and an unused external output path.",
    );
    process.exitCode = 1;
  }
}
