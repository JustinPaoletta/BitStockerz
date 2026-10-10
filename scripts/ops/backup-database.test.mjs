import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  backupDatabase,
  databaseSettings,
  externalOutput,
} from "./backup-database.mjs";

const password = randomBytes(20).toString("hex");
const url = new URL("mysql://backup@db.example.test:3306/bitstockerz");
url.password = password;
const cloud = {
  DATABASE_URL: url.href,
  DATABASE_CA_CERT_PATH: "/tmp/provider-ca.pem",
};

test("cloud dumps require certificate and hostname verification, regardless of URL TLS options", () => {
  const settings = databaseSettings({
    ...cloud,
    DATABASE_URL: `${url.href}?sslaccept=accept_invalid_certs`,
  });
  assert.equal(settings.database, "bitstockerz");
  assert.match(settings.config, /ssl-mode=VERIFY_IDENTITY/);
  assert.match(settings.config, /ssl-ca="\/tmp\/provider-ca.pem"/);
  assert.throws(
    () => databaseSettings({ DATABASE_URL: url.href }),
    /DATABASE_CA_REQUIRED/,
  );
  assert.throws(() =>
    databaseSettings({
      ...cloud,
      DATABASE_URL: "mysql://operator@db.example.test/--all-databases",
    }),
  );
  assert.throws(() =>
    databaseSettings({
      ...cloud,
      DATABASE_URL: "mysql://operator%0Aevil@db.example.test/app",
    }),
  );
});

test("plaintext fixture exception requires CI, loopback and a disposable database prefix", () => {
  const fixture = {
    CI: "true",
    DATABASE_URL: "mysql://operator@127.0.0.1/bitstockerz_backup_fixture_test",
  };
  assert.match(databaseSettings(fixture, true).config, /ssl-mode=DISABLED/);
  for (const env of [
    cloud,
    { ...fixture, CI: "false" },
    { ...fixture, DATABASE_URL: "mysql://operator@127.0.0.1/bitstockerz" },
    {
      ...fixture,
      DATABASE_URL:
        "mysql://operator@db.example.test/bitstockerz_backup_fixture_test",
    },
  ]) {
    assert.throws(() => databaseSettings(env, true), /LOCAL_FIXTURE_ONLY/);
  }
});

test("backup files cannot be written into the repository, including through a symlink", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "backup-path-test-"));
  try {
    const repo = new URL("../../", import.meta.url).pathname;
    await assert.rejects(
      externalOutput(join(repo, "backup.age")),
      /OUTSIDE_REPOSITORY/,
    );
    await assert.rejects(
      externalOutput("backup.age"),
      /ABSOLUTE_OUTPUT_REQUIRED/,
    );
    await symlink(repo, join(temporary, "repo"));
    await assert.rejects(
      externalOutput(join(temporary, "repo", "backup.age")),
      /OUTSIDE_REPOSITORY/,
    );
    assert.match(
      await externalOutput(join(temporary, "backup.age")),
      /backup\.age$/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("failed tools publish no backup and remove temporary credentials", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "backup-failure-test-"));
  try {
    await assert.rejects(
      backupDatabase({
        output: join(temporary, "backup.age"),
        recipient: `age1${"a".repeat(58)}`,
        localFixture: true,
        env: {
          CI: "true",
          PATH: "/nonexistent",
          DATABASE_URL:
            "mysql://operator@127.0.0.1/bitstockerz_backup_fixture_test",
        },
      }),
    );
    assert.deepEqual(await readdir(temporary), []);
    const result = spawnSync(
      process.execPath,
      [
        new URL("./backup-database.mjs", import.meta.url).pathname,
        "--output",
        join(temporary, "backup.age"),
        "--recipient",
        "invalid",
      ],
      { env: cloud, encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.ok(!result.stderr.includes(password));
    assert.ok(!result.stderr.includes(url.hostname));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
