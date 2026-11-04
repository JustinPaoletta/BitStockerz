import { randomBytes, createHash, X509Certificate } from 'node:crypto';
import { writeFile, unlink, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { isEmail } from 'class-validator';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Operator-only, no HTTP endpoint. DATABASE_URL comes from the operator's
// environment; neither connection details nor raw tokens go to stdout/logs.
export function parseArgs(args) {
  const [command, ...flags] = args;
  if (!['create', 'revoke', 'status', 'revoke-invitation'].includes(command))
    throw new Error('INVALID_ARGUMENTS');
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !flags[i].startsWith('--') ||
      !flags[i + 1] ||
      flags[i + 1].startsWith('--')
    )
      throw new Error('INVALID_ARGUMENTS');
    const name = flags[i].slice(2);
    if (
      !['email', 'output', 'hours', 'user-id', 'hash'].includes(name) ||
      name in options
    )
      throw new Error('INVALID_ARGUMENTS');
    options[name] = flags[i + 1];
  }
  if (command === 'create') {
    const email = options.email?.trim().toLowerCase();
    const hours = Number(options.hours ?? '24');
    if (
      !email ||
      email.length > 191 ||
      !isEmail(email) ||
      !options.output ||
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 168 ||
      options['user-id'] ||
      options.hash
    )
      throw new Error('INVALID_ARGUMENTS');
    return { command, email, output: resolve(options.output), hours };
  }
  if (command === 'revoke-invitation') {
    if (
      !/^[a-f0-9]{64}$/.test(options.hash ?? '') ||
      Object.keys(options).length !== 1
    )
      throw new Error('INVALID_ARGUMENTS');
    return { command, hash: options.hash };
  }
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      options['user-id'] ?? '',
    ) ||
    Object.keys(options).length !== 1
  )
    throw new Error('INVALID_ARGUMENTS');
  return { command, userId: options['user-id'] };
}

export async function run(options, db) {
  if (options.command === 'create') {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + options.hours * 3_600_000);
    // Exclusive mode rejects existing files/symlinks; raw invitation stays in
    // this private file. The caller chooses its secure storage and delivery.
    await writeFile(
      options.output,
      JSON.stringify({
        invitation_token: token,
        expires_at: expiresAt.toISOString(),
      }) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    try {
      await db.mobileInvitation.create({
        data: {
          tokenHash,
          email: options.email,
          expiresAt,
          createdAt: new Date(),
        },
      });
    } catch (error) {
      await unlink(options.output).catch(() => undefined);
      throw error;
    }
    return {
      invitation_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      token_saved: true,
    };
  }
  if (options.command === 'revoke-invitation') {
    const result = await db.mobileInvitation.updateMany({
      where: { tokenHash: options.hash, revokedAt: null, consumedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count === 1 };
  }
  if (options.command === 'revoke') {
    await db.$transaction(async (tx) => {
      await tx.mobileAdmission.updateMany({
        where: { userId: options.userId },
        data: { revokedAt: new Date() },
      });
      await tx.authSession.deleteMany({ where: { userId: options.userId } });
    });
    return { revoked: true };
  }
  const row = await db.mobileAdmission.findUnique({
    where: { userId: options.userId },
  });
  return {
    status: !row ? 'not_admitted' : row.revokedAt ? 'revoked' : 'admitted',
  };
}

export async function databaseAdapterConfig(env) {
  const url = new URL(env.DATABASE_URL ?? '');
  if (
    !['mysql:', 'mariadb:'].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length < 2
  )
    throw new Error('DATABASE_URL_REQUIRED');
  if (!env.DATABASE_CA_CERT_PATH) {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      throw new Error('DATABASE_CA_CERT_PATH_REQUIRED');
    return env.DATABASE_URL;
  }
  const ca = await readFile(env.DATABASE_CA_CERT_PATH, 'utf8');
  new X509Certificate(ca);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    connectionLimit: 2,
    ssl: { ca, rejectUnauthorized: true },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let db;
  try {
    const options = parseArgs(process.argv.slice(2));
    const adapterConfig = await databaseAdapterConfig(process.env);
    db = new PrismaClient({ adapter: new PrismaMariaDb(adapterConfig) });
    console.log(JSON.stringify(await run(options, db)));
  } catch {
    console.error(
      'Mobile admission command failed. Check arguments, private output path, database access, and applied migrations.',
    );
    process.exitCode = 1;
  } finally {
    await db?.$disconnect();
  }
}
