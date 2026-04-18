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
    expect(config.auth).toEqual({
      sessionTtlSeconds: 43200,
      challengeTtlSeconds: 300,
      oauthStateTtlSeconds: 300,
      rateLimitWindowMs: 60000,
      rateLimitMaxRequests: 30,
      webauthnRpId: 'localhost',
      webauthnRpName: 'BitStockerz',
      webauthnAllowedOrigins: [],
      googleClientId: undefined,
      googleClientSecret: undefined,
      googleRedirectUri: undefined,
      appleClientId: undefined,
      appleTeamId: undefined,
      appleKeyId: undefined,
      applePrivateKey: undefined,
      appleRedirectUri: undefined,
    });
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
      AUTH_SESSION_TTL_SECONDS: '7200',
      AUTH_CHALLENGE_TTL_SECONDS: '180',
      AUTH_OAUTH_STATE_TTL_SECONDS: '240',
      AUTH_RATE_LIMIT_WINDOW_MS: '45000',
      AUTH_RATE_LIMIT_MAX_REQUESTS: '15',
      WEBAUTHN_RP_ID: 'api.bitstockerz.test',
      WEBAUTHN_RP_NAME: 'BitStockerz Test',
      WEBAUTHN_ALLOWED_ORIGINS: 'https://app.bitstockerz.test,http://localhost:4200',
      GOOGLE_OAUTH_CLIENT_ID: 'google-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'google-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.bitstockerz.test/api/auth/oauth/google/callback',
      APPLE_OAUTH_CLIENT_ID: 'apple-client-id',
      APPLE_OAUTH_TEAM_ID: 'APPLETEAM',
      APPLE_OAUTH_KEY_ID: 'APPLEKEY',
      APPLE_OAUTH_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      APPLE_OAUTH_REDIRECT_URI: 'https://api.bitstockerz.test/api/auth/oauth/apple/callback',
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
    expect(config.auth).toEqual({
      sessionTtlSeconds: 7200,
      challengeTtlSeconds: 180,
      oauthStateTtlSeconds: 240,
      rateLimitWindowMs: 45000,
      rateLimitMaxRequests: 15,
      webauthnRpId: 'api.bitstockerz.test',
      webauthnRpName: 'BitStockerz Test',
      webauthnAllowedOrigins: [
        'https://app.bitstockerz.test',
        'http://localhost:4200',
      ],
      googleClientId: 'google-client-id',
      googleClientSecret: 'google-client-secret',
      googleRedirectUri:
        'https://api.bitstockerz.test/api/auth/oauth/google/callback',
      appleClientId: 'apple-client-id',
      appleTeamId: 'APPLETEAM',
      appleKeyId: 'APPLEKEY',
      applePrivateKey:
        '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      appleRedirectUri:
        'https://api.bitstockerz.test/api/auth/oauth/apple/callback',
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
        AUTH_SESSION_TTL_SECONDS: '0',
        AUTH_CHALLENGE_TTL_SECONDS: '9999',
        AUTH_OAUTH_STATE_TTL_SECONDS: '0',
        AUTH_RATE_LIMIT_WINDOW_MS: '10',
        AUTH_RATE_LIMIT_MAX_REQUESTS: '0',
        WEBAUTHN_ALLOWED_ORIGINS: 'notaurl',
        GOOGLE_OAUTH_CLIENT_ID: 'google-only-client',
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
    process.env.AUTH_SESSION_TTL_SECONDS = '5400';
    process.env.AUTH_CHALLENGE_TTL_SECONDS = '150';
    process.env.AUTH_OAUTH_STATE_TTL_SECONDS = '180';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '30000';
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = '12';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_RP_NAME = 'BitStockerz Local';
    process.env.WEBAUTHN_ALLOWED_ORIGINS = 'http://localhost:4200';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI =
      'http://localhost:3000/api/auth/oauth/google/callback';
    process.env.APPLE_OAUTH_CLIENT_ID = 'apple-client-id';
    process.env.APPLE_OAUTH_TEAM_ID = 'APPLETEAM';
    process.env.APPLE_OAUTH_KEY_ID = 'APPLEKEY';
    process.env.APPLE_OAUTH_PRIVATE_KEY =
      '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----';
    process.env.APPLE_OAUTH_REDIRECT_URI =
      'http://localhost:3000/api/auth/oauth/apple/callback';

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
    expect(service.auth).toEqual({
      sessionTtlSeconds: 5400,
      challengeTtlSeconds: 150,
      oauthStateTtlSeconds: 180,
      rateLimitWindowMs: 30000,
      rateLimitMaxRequests: 12,
      webauthnRpId: 'localhost',
      webauthnRpName: 'BitStockerz Local',
      webauthnAllowedOrigins: ['http://localhost:4200'],
      googleClientId: 'google-client-id',
      googleClientSecret: 'google-client-secret',
      googleRedirectUri: 'http://localhost:3000/api/auth/oauth/google/callback',
      appleClientId: 'apple-client-id',
      appleTeamId: 'APPLETEAM',
      appleKeyId: 'APPLEKEY',
      applePrivateKey:
        '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
      appleRedirectUri: 'http://localhost:3000/api/auth/oauth/apple/callback',
    });
  });

  it('throws when process.env contains invalid configuration', () => {
    process.env.PORT = 'abc';
    expect(() => new AppConfigService()).toThrow(/Invalid configuration/);
  });
});
