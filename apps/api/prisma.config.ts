import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL;
const databaseCaPath = process.env.DATABASE_CA_CERT_PATH;
let migrationUrl: URL | undefined;
try {
  migrationUrl = databaseUrl ? new URL(databaseUrl) : undefined;
} catch {
  throw new Error('DATABASE_URL is not a valid URL');
}
if (migrationUrl && databaseCaPath) {
  migrationUrl.searchParams.set('sslcert', databaseCaPath);
  migrationUrl.searchParams.set('sslaccept', 'strict');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(migrationUrl
    ? {
        datasource: {
          url: migrationUrl.toString(),
        },
      }
    : {}),
});
