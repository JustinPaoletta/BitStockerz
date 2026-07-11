import type { AppConfigService } from '../config/app-config.service';
import { PrismaService } from './prisma.service';

function createConfig(
  databaseUrl: string | undefined,
  nodeEnv = 'test',
): AppConfigService {
  return {
    server: { nodeEnv },
    dependencies: {
      databaseUrl,
      marketDataHealthUrl: undefined,
    },
  } as AppConfigService;
}

describe('PrismaService', () => {
  it.each([undefined, 'not-a-url', 'postgres://localhost/bitstockerz'])(
    'stays disabled for an unsupported database URL (%s)',
    async (databaseUrl) => {
      const service = new PrismaService(createConfig(databaseUrl));

      expect(service.isEnabled).toBe(false);
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    },
  );

  it('stays disabled in the test environment even for a MySQL URL', () => {
    const service = new PrismaService(
      createConfig('mysql://user:password@localhost:3306/bitstockerz'),
    );

    expect(service.isEnabled).toBe(false);
  });

  it('fails clearly when a disabled client delegate is accessed', () => {
    const service = new PrismaService(createConfig(undefined));
    const expectedMessage =
      'Prisma client is not configured. Set DATABASE_URL to enable database access.';

    expect(() => service.symbol).toThrow(expectedMessage);
    expect(() => service.equityDailyBar).toThrow(expectedMessage);
    expect(() => service.cryptoDailyBar).toThrow(expectedMessage);
    expect(() => service.cryptoHourlyBar).toThrow(expectedMessage);
  });

  it('enables mariadb protocol urls outside the test environment', async () => {
    const service = new PrismaService(
      createConfig(
        'mariadb://user:password@localhost:3306/bitstockerz',
        'development',
      ),
    );

    expect(service.isEnabled).toBe(true);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('exposes every delegate when a MySQL client is enabled', async () => {
    const service = new PrismaService(
      createConfig(
        'mysql://user:password@localhost:3306/bitstockerz',
        'development',
      ),
    );

    expect(service.isEnabled).toBe(true);
    expect(service.symbol).toBeDefined();
    expect(service.equityDailyBar).toBeDefined();
    expect(service.cryptoDailyBar).toBeDefined();
    expect(service.cryptoHourlyBar).toBeDefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
