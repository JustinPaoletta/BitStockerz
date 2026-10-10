import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { backupDatabase, databaseSettings } from "./backup-database.mjs";

async function command(binary, args, input) {
  const child = spawn(binary, args, { stdio: ["pipe", "pipe", "pipe"] });
  const chunks = [];
  let diagnostics = "";
  child.stderr.on("data", (chunk) => {
    if (diagnostics.length < 4096)
      diagnostics += chunk.toString().slice(0, 4096 - diagnostics.length);
  });
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    child.once("error", () => reject(new Error("Fixture tool failed")));
    child.once("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(
            new Error(
              `${binary} fixture command failed (exit ${code}; MySQL code ${diagnostics.match(/ERROR (\d+)/)?.[1] || "none"})`,
            ),
          ),
    );
  });
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  return done;
}

test("encrypted export restores balances, relations, JSON and binary values into a separate MySQL database", async () => {
  assert.equal(process.env.CI, "true", "This drill only runs in disposable CI");
  const sourceUrl = new URL(process.env.BACKUP_DRILL_DATABASE_URL);
  assert.equal(sourceUrl.hostname, "127.0.0.1");
  const suffix = randomBytes(6).toString("hex");
  const source = `bitstockerz_backup_fixture_${suffix}`;
  const target = `bitstockerz_backup_fixture_restore_${suffix}`;
  const restoreUser = `restore_${suffix}`;
  const restorePassword = randomBytes(20).toString("hex");
  sourceUrl.pathname = `/${source}`;
  const env = { ...process.env, DATABASE_URL: sourceUrl.href };
  const temporary = await mkdtemp(
    join(tmpdir(), "bitstockerz-recovery-drill-"),
  );
  const adminConfig = join(temporary, "admin.cnf");
  const encrypted = join(temporary, "fixture.sql.gz.age");
  const identity = join(temporary, "identity.txt");
  await writeFile(adminConfig, databaseSettings(env, true).config, {
    mode: 0o600,
  });
  const mysql = (sql, database, config = adminConfig) =>
    command(
      "mysql",
      [
        `--defaults-file=${config}`,
        "--no-login-paths",
        "--batch",
        "--raw",
        "--skip-column-names",
        ...(database ? [database] : []),
      ],
      sql,
    );
  try {
    await mysql(`CREATE DATABASE ${source}; CREATE DATABASE ${target};
      CREATE USER '${restoreUser}'@'%' IDENTIFIED BY '${restorePassword}';
      GRANT ALL ON ${target}.* TO '${restoreUser}'@'%';`);
    await mysql(
      `CREATE TABLE users (id CHAR(36) PRIMARY KEY, name VARCHAR(80)) ENGINE=InnoDB;
      CREATE TABLE accounts (id INT PRIMARY KEY, user_id CHAR(36), cash DECIMAL(20,8),
        FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB;
      CREATE TABLE strategies (id INT PRIMARY KEY, user_id CHAR(36), version INT, rules JSON,
        FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB;
      CREATE TABLE credentials (id INT PRIMARY KEY, user_id CHAR(36), public_key BLOB,
        FOREIGN KEY (user_id) REFERENCES users(id)) ENGINE=InnoDB;
      INSERT INTO users VALUES ('00000000-0000-4000-8000-000000000001', 'Recovery fixture 🦜');
      INSERT INTO accounts VALUES (1, '00000000-0000-4000-8000-000000000001', 12345.67890123);
      INSERT INTO strategies VALUES (7, '00000000-0000-4000-8000-000000000001', 3, '{"symbol":"AAPL","period":20}');
      INSERT INTO credentials VALUES (1, '00000000-0000-4000-8000-000000000001', X'000AFF7F');`,
      source,
    );
    await command("age-keygen", ["-o", identity]);
    const recipient = (await command("age-keygen", ["-y", identity]))
      .toString()
      .trim();
    const result = await backupDatabase({
      output: encrypted,
      recipient,
      localFixture: true,
      env,
    });
    assert.equal(result.status, "encrypted");
    assert.equal((await stat(encrypted)).mode & 0o777, 0o600);
    const bytes = await readFile(encrypted);
    assert.ok(!bytes.includes(Buffer.from("12345.67890123")));
    const sql = gunzipSync(
      await command("age", ["--decrypt", "-i", identity, encrypted]),
    );
    const restoreUrl = new URL(sourceUrl);
    restoreUrl.username = restoreUser;
    restoreUrl.password = restorePassword;
    restoreUrl.pathname = `/${target}`;
    const restoreConfig = join(temporary, "restore.cnf");
    await writeFile(
      restoreConfig,
      databaseSettings({ ...env, DATABASE_URL: restoreUrl.href }, true).config,
      { mode: 0o600 },
    );
    await mysql(sql, target, restoreConfig);
    const snapshot = `SELECT id, name FROM users ORDER BY id;
      SELECT id, user_id, cash FROM accounts ORDER BY id;
      SELECT id, user_id, version, rules FROM strategies ORDER BY id;
      SELECT id, user_id, HEX(public_key) FROM credentials ORDER BY id;`;
    assert.deepEqual(
      await mysql(snapshot, target),
      await mysql(snapshot, source),
    );
    // The restore principal cannot modify the source database.
    await assert.rejects(
      mysql(
        `UPDATE ${source}.accounts SET cash = 0 WHERE id = 1;`,
        target,
        restoreConfig,
      ),
    );
    await assert.rejects(
      backupDatabase({ output: encrypted, recipient, localFixture: true, env }),
    );
    assert.deepEqual(
      await readFile(encrypted),
      bytes,
      "Existing backup must survive a repeated output path",
    );
    const corrupted = Buffer.from(bytes);
    corrupted[corrupted.length - 1] ^= 1;
    const damaged = join(temporary, "damaged.age");
    await writeFile(damaged, corrupted);
    await assert.rejects(
      command("age", ["--decrypt", "-i", identity, damaged]),
    );
  } finally {
    try {
      await mysql(
        `DROP DATABASE IF EXISTS ${source}; DROP DATABASE IF EXISTS ${target}; DROP USER IF EXISTS '${restoreUser}'@'%';`,
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
});
