import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { parseArgs, run, databaseAdapterConfig } from './mobile-admission.mjs';

test('operator parsing rejects malformed identity, repeated flags and unbounded TTL', () => {
  for (const args of [
    [],
    ['create', '--email', 'bad', '--output', '/tmp/private'],
    [
      'create',
      '--email',
      'a@example.com',
      '--output',
      '/tmp/private',
      '--hours',
      '999',
    ],
    ['status', '--user-id', 'secret'],
    [
      'create',
      '--email',
      'a@example.com',
      '--email',
      'b@example.com',
      '--output',
      '/tmp/private',
    ],
  ])
    assert.throws(() => parseArgs(args));
  assert.equal(
    parseArgs([
      'create',
      '--email',
      'OWNER@example.com',
      '--output',
      '/tmp/private',
    ]).email,
    'owner@example.com',
  );
});

test('provisioning writes a new private token file, stores only its hash and never overwrites', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bs-invite-'));
  try {
    const output = join(dir, 'invitation.json');
    const writes = [];
    const db = {
      mobileInvitation: { create: async (args) => writes.push(args) },
    };
    const result = await run(
      { command: 'create', email: 'owner@example.com', hours: 1, output },
      db,
    );
    const saved = JSON.parse(await readFile(output, 'utf8'));
    assert.match(saved.invitation_token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    assert.equal(
      writes[0].data.tokenHash,
      createHash('sha256').update(saved.invitation_token).digest('hex'),
    );
    assert.ok(!JSON.stringify(writes).includes(saved.invitation_token));
    assert.ok(!JSON.stringify(result).includes(saved.invitation_token));
    await assert.rejects(
      run(
        { command: 'create', email: 'owner@example.com', hours: 1, output },
        db,
      ),
    );
    assert.equal(
      JSON.parse(await readFile(output, 'utf8')).invitation_token,
      saved.invitation_token,
    );
    const failedOutput = join(dir, 'failed.json');
    await assert.rejects(
      run(
        {
          command: 'create',
          email: 'owner@example.com',
          hours: 1,
          output: failedOutput,
        },
        {
          mobileInvitation: {
            create: async () => {
              throw new Error('DB failure');
            },
          },
        },
      ),
    );
    await assert.rejects(stat(failedOutput));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('remote operator DB access requires a validated CA and certificate verification', async () => {
  await assert.rejects(
    databaseAdapterConfig({
      DATABASE_URL: 'mysql://db.example.com/app',
    }),
  );
  assert.equal(
    await databaseAdapterConfig({ DATABASE_URL: 'mysql://localhost/fixture' }),
    'mysql://localhost/fixture',
  );
  const dir = await mkdtemp(join(tmpdir(), 'bs-ca-'));
  try {
    const path = join(dir, 'ca.pem');
    await writeFile(path, rootCertificates[0]);
    const fixturePassword = randomBytes(16).toString('hex') + '@';
    const fixtureUrl = new URL('mysql://db.example.com:3307/app');
    fixtureUrl.username = 'fixture';
    fixtureUrl.password = fixturePassword;
    const config = await databaseAdapterConfig({
      DATABASE_URL: fixtureUrl.href,
      DATABASE_CA_CERT_PATH: path,
    });
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.ssl.ca, rootCertificates[0]);
    assert.equal(config.password, fixturePassword);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('revocation changes persistent admission and clears all sessions in one transaction', async () => {
  const calls = [];
  const tx = {
    mobileAdmission: {
      updateMany: async (args) => calls.push(['admission', args]),
    },
    authSession: { deleteMany: async (args) => calls.push(['sessions', args]) },
  };
  const result = await run(
    { command: 'revoke', userId: 'immutable-user-id' },
    { $transaction: async (fn) => fn(tx) },
  );
  assert.deepEqual(result, { revoked: true });
  assert.deepEqual(
    calls.map((call) => [call[0], call[1].where]),
    [
      ['admission', { userId: 'immutable-user-id' }],
      ['sessions', { userId: 'immutable-user-id' }],
    ],
  );
  const status = await run(
    { command: 'status', userId: 'immutable-user-id' },
    {
      mobileAdmission: { findUnique: async () => ({ revokedAt: new Date() }) },
    },
  );
  assert.deepEqual(status, { status: 'revoked' });
});
