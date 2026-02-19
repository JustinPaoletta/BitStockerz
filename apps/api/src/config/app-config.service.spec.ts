import { AppConfigService, loadAppConfig } from './app-config.service';

describe('loadAppConfig', () => {
  it('uses safe defaults when optional env vars are not set', () => {
    const config = loadAppConfig({});

    expect(config.server.port).toBe(3000);
    expect(config.server.nodeEnv).toBe('development');
    expect(config.logging.level).toBe('info');
    expect(config.logging.writeToFile).toBe(false);
    expect(config.logging.filePath).toBe('logs/api.log');
    expect(config.readiness.timeoutMs).toBe(1500);
    expect(config.dependencies.databaseUrl).toBeUndefined();
    expect(config.dependencies.marketDataHealthUrl).toBeUndefined();
  });

  it('parses valid overrides from environment', () => {
    const config = loadAppConfig({
      NODE_ENV: 'production',
      PORT: '4100',
      LOG_LEVEL: 'warn',
      LOG_TO_FILE: 'true',
      LOG_FILE_PATH: '/tmp/api.log',
      READINESS_TIMEOUT_MS: '2500',
      DATABASE_URL: 'postgres://localhost:5432/bitstockerz',
      MARKET_DATA_HEALTH_URL: 'https://market-data.example.com/health',
    });

    expect(config.server).toEqual({
      port: 4100,
      nodeEnv: 'production',
    });
    expect(config.logging).toEqual({
      level: 'warn',
      nodeEnv: 'production',
      writeToFile: true,
      filePath: '/tmp/api.log',
    });
    expect(config.readiness.timeoutMs).toBe(2500);
    expect(config.dependencies).toEqual({
      databaseUrl: 'postgres://localhost:5432/bitstockerz',
      marketDataHealthUrl: 'https://market-data.example.com/health',
    });
  });

  it('enables file logging when only LOG_FILE_PATH is provided', () => {
    const config = loadAppConfig({
      LOG_FILE_PATH: '/tmp/only-path.log',
    });

    expect(config.logging.writeToFile).toBe(true);
    expect(config.logging.filePath).toBe('/tmp/only-path.log');
  });

  it('throws with clear errors for invalid values', () => {
    expect(() => {
      loadAppConfig({
        NODE_ENV: 'staging',
        PORT: 'abc',
        LOG_LEVEL: 'verbose',
        LOG_TO_FILE: 'maybe',
        READINESS_TIMEOUT_MS: '99',
        DATABASE_URL: 'not-a-url',
        MARKET_DATA_HEALTH_URL: 'ftp://example.com/health',
      });
    }).toThrow(/Invalid configuration/);
  });
});

describe('AppConfigService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('constructs from process.env and exposes typed getters', () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = '4300';
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_TO_FILE = 'true';
    process.env.LOG_FILE_PATH = '/tmp/config-service.log';
    process.env.READINESS_TIMEOUT_MS = '2100';
    process.env.DATABASE_URL = 'postgres://localhost:5432/bitstockerz';
    process.env.MARKET_DATA_HEALTH_URL = 'https://market-data.example.com/health';

    const service = new AppConfigService();

    expect(service.server).toEqual({
      port: 4300,
      nodeEnv: 'test',
    });
    expect(service.logging).toEqual({
      level: 'debug',
      nodeEnv: 'test',
      writeToFile: true,
      filePath: '/tmp/config-service.log',
    });
    expect(service.readiness).toEqual({
      timeoutMs: 2100,
    });
    expect(service.dependencies).toEqual({
      databaseUrl: 'postgres://localhost:5432/bitstockerz',
      marketDataHealthUrl: 'https://market-data.example.com/health',
    });
  });

  it('throws when process.env contains invalid configuration', () => {
    process.env.PORT = 'abc';
    expect(() => new AppConfigService()).toThrow(/Invalid configuration/);
  });
});
