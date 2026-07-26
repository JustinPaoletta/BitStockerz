import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/errors/http-exception.filter';
import { AppLogger } from '../src/common/logging/app-logger';
import { AuditService } from '../src/observability/audit.service';
import {
  SEED_CRYPTO_DAILY_SAMPLE,
  SEED_CRYPTO_HOURLY_SAMPLE,
  SEED_EQUITY_SAMPLE,
} from '../src/market-data/seed-candles';

function createApp(module: TestingModule): INestApplication {
  const app = module.createNestApplication();
  app.useLogger(app.get(AppLogger));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(app.get(GlobalHttpExceptionFilter));
  return app;
}

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api returns 200', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /api/health/live returns { status: "ok" }', () => {
    return request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ status: 'ok' });
      });
  });
});

describe('Health readiness (e2e)', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalMarketDataHealthUrl = process.env.MARKET_DATA_HEALTH_URL;
  let app: INestApplication<App>;

  async function initApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture);
    await app.init();
  }

  afterEach(async () => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }

    if (originalMarketDataHealthUrl === undefined) {
      delete process.env.MARKET_DATA_HEALTH_URL;
    } else {
      process.env.MARKET_DATA_HEALTH_URL = originalMarketDataHealthUrl;
    }

    if (app) {
      await app.close();
    }
  });

  it('GET /api/health/ready returns ready when checks are not configured', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.MARKET_DATA_HEALTH_URL;

    await initApp();

    return request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect((res) => {
        expect(res.body.ready).toBe(true);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body.checks.database.status).toBe('not_configured');
        expect(res.body.checks.marketData.status).toBe('not_configured');
      });
  });

  it('GET /api/health/ready returns 503 when database dependency is configured but down', async () => {
    process.env.DATABASE_URL = 'postgres://127.0.0.1:1/bitstockerz';
    delete process.env.MARKET_DATA_HEALTH_URL;

    await initApp();

    return request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503)
      .expect((res) => {
        expect(res.body.ready).toBe(false);
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.database.status).toBe('down');
      });
  });

  it('starts when mysql DATABASE_URL is configured but unreachable', async () => {
    process.env.DATABASE_URL = 'mysql://127.0.0.1:1/bitstockerz';
    delete process.env.MARKET_DATA_HEALTH_URL;

    await initApp();

    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual({ status: 'ok' });
      });

    return request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(503)
      .expect((res) => {
        expect(res.body.ready).toBe(false);
        expect(res.body.status).toBe('degraded');
        expect(res.body.checks.database.status).toBe('down');
      });
  });
});

describe('Error contract (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const rfc7807Fields = [
    'type',
    'title',
    'status',
    'detail',
    'instance',
    'code',
    'requestId',
  ];

  function expectRfc7807Shape(body: Record<string, unknown>) {
    rfc7807Fields.forEach((field) => {
      expect(body).toHaveProperty(field);
    });
    expect(body.type).toMatch(/^https:\/\/bitstockerz\.dev\/errors\//);
    expect(typeof body.requestId).toBe('string');
    expect((body.requestId as string).length).toBeGreaterThan(0);
  }

  async function registerAndGetToken(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'error-contract@example.com' })
      .expect(201);
    return response.body.access_token as string;
  }

  it('malformed request body returns 400 with VALIDATION_ERROR, fieldErrors, requestId', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ invalid: 'body', name: 123 })
      .expect(400)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.requestId).toBeDefined();
        expect(Array.isArray(res.body.fieldErrors)).toBe(true);
        expect(res.body.fieldErrors.length).toBeGreaterThan(0);
        expect(res.body.instance).toBe('/api/strategies');
      });
  });

  it('unauthorized returns 401 with code UNAUTHORIZED', () => {
    return request(app.getHttpServer())
      .get('/api/error-test/unauthorized')
      .expect(401)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });

  it('forbidden returns 403 with code FORBIDDEN', () => {
    return request(app.getHttpServer())
      .get('/api/error-test/forbidden')
      .expect(403)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('FORBIDDEN');
      });
  });

  it('unknown route returns 404 with code NOT_FOUND', () => {
    return request(app.getHttpServer())
      .get('/api/nonexistent-route')
      .expect(404)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('NOT_FOUND');
      });
  });

  it('conflict returns 409 with code CONFLICT', () => {
    return request(app.getHttpServer())
      .get('/api/error-test/conflict')
      .expect(409)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('CONFLICT');
      });
  });

  it('rate limit returns 429 with code RATE_LIMITED', () => {
    return request(app.getHttpServer())
      .get('/api/error-test/rate-limited')
      .expect(429)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('RATE_LIMITED');
      });
  });

  it('unhandled error returns 500 with INTERNAL_ERROR and no stack trace', () => {
    return request(app.getHttpServer())
      .get('/api/error-test/internal')
      .expect(500)
      .expect((res) => {
        expectRfc7807Shape(res.body as Record<string, unknown>);
        expect(res.body.code).toBe('INTERNAL_ERROR');
        expect(res.body).not.toHaveProperty('stack');
        expect(res.body.detail).not.toContain('Unhandled internal error');
        expect(res.body.detail).toBe('An unexpected error occurred.');
      });
  });

  it('all error responses have RFC 7807 base fields plus code and requestId', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400)
      .expect((res) => {
        const body = res.body as Record<string, unknown>;
        expect(body).toHaveProperty('type');
        expect(body).toHaveProperty('title');
        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('detail');
        expect(body).toHaveProperty('instance');
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('requestId');
        expect(body).toHaveProperty('fieldErrors');
      });
  });
});

describe('Authentication and profile (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers, returns profile, updates profile, and invalidates token on logout', async () => {
    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'user@example.com', display_name: 'First Name' })
      .expect(201);

    expect(registerResponse.body.token_type).toBe('Bearer');
    expect(registerResponse.body.access_token).toBeDefined();
    expect(registerResponse.body.user.email).toBe('user@example.com');
    expect(registerResponse.body.user.base_currency).toBe('USD');
    expect(registerResponse.body.user.linked_auth_methods).toEqual({
      passkeys: true,
      google: false,
      apple: false,
    });

    const token = registerResponse.body.access_token as string;
    const authorizationHeader = `Bearer ${token}`;

    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', authorizationHeader)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe('user@example.com');
      });

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', authorizationHeader)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe('user@example.com');
      });

    await request(app.getHttpServer())
      .patch('/api/me')
      .set('Authorization', authorizationHeader)
      .send({ display_name: 'Renamed User', base_currency: 'USD' })
      .expect(200)
      .expect((res) => {
        expect(res.body.display_name).toBe('Renamed User');
        expect(res.body.base_currency).toBe('USD');
      });

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', authorizationHeader)
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
      });

    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', authorizationHeader)
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });

  it('rejects unauthenticated profile requests', async () => {
    await request(app.getHttpServer())
      .get('/api/me')
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });

  it('supports webauthn registration and login ceremony endpoints', async () => {
    const optionsResponse = await request(app.getHttpServer())
      .post('/api/auth/webauthn/register/options')
      .send({ email: 'passkey@example.com' })
      .expect(201);

    expect(optionsResponse.body.challenge_id).toBeDefined();
    expect(optionsResponse.body.challenge).toBeDefined();
    expect(optionsResponse.body.rp_id).toBeDefined();

    const registerVerifyResponse = await request(app.getHttpServer())
      .post('/api/auth/webauthn/register/verify')
      .send({
        email: 'passkey@example.com',
        challenge_id: optionsResponse.body.challenge_id,
        challenge: optionsResponse.body.challenge,
        credential_id: 'credential-passkey-1',
        public_key: 'public-key-value',
        sign_count: 1,
        transports: ['internal'],
      })
      .expect(201);

    expect(registerVerifyResponse.body.token_type).toBe('Bearer');
    expect(registerVerifyResponse.body.user.email).toBe('passkey@example.com');

    const loginOptionsResponse = await request(app.getHttpServer())
      .post('/api/auth/webauthn/login/options')
      .send({ email: 'passkey@example.com' })
      .expect(201);

    expect(loginOptionsResponse.body.allow_credentials).toEqual([
      'credential-passkey-1',
    ]);

    const loginVerifyResponse = await request(app.getHttpServer())
      .post('/api/auth/webauthn/login/verify')
      .send({
        email: 'passkey@example.com',
        challenge_id: loginOptionsResponse.body.challenge_id,
        challenge: loginOptionsResponse.body.challenge,
        credential_id: 'credential-passkey-1',
        sign_count: 2,
      })
      .expect(201);

    expect(loginVerifyResponse.body.token_type).toBe('Bearer');
    expect(loginVerifyResponse.body.user.email).toBe('passkey@example.com');
  });

  it('supports oauth start/callback and account linking', async () => {
    const googleStart = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/start')
      .expect(200);

    expect(googleStart.body.state).toBeDefined();
    expect(googleStart.body.provider).toBe('google');

    const googleCallback = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback')
      .query({
        state: googleStart.body.state,
        code: 'google-code-1',
        email: 'oauth-user@example.com',
        sub: 'google-subject-1',
      })
      .expect(200);

    expect(googleCallback.body.user.email).toBe('oauth-user@example.com');
    expect(googleCallback.body.user.linked_auth_methods.google).toBe(true);

    const googleStart2 = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/start')
      .expect(200);

    const googleCallback2 = await request(app.getHttpServer())
      .get('/api/auth/oauth/google/callback')
      .query({
        state: googleStart2.body.state,
        code: 'google-code-2',
        email: 'different@example.com',
        sub: 'google-subject-1',
      })
      .expect(200);

    expect(googleCallback2.body.user.id).toBe(googleCallback.body.user.id);

    const appleStart = await request(app.getHttpServer())
      .get('/api/auth/oauth/apple/start')
      .expect(200);

    const appleCallback = await request(app.getHttpServer())
      .get('/api/auth/oauth/apple/callback')
      .query({
        state: appleStart.body.state,
        code: 'apple-code-1',
        sub: 'apple-subject-1',
      })
      .expect(200);

    expect(appleCallback.body.user.linked_auth_methods.apple).toBe(true);
  });
});

describe('Auth limits and TTL (e2e)', () => {
  const originalAuthRateLimitMaxRequests =
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
  const originalAuthRateLimitWindowMs = process.env.AUTH_RATE_LIMIT_WINDOW_MS;
  const originalAuthSessionTtlSeconds = process.env.AUTH_SESSION_TTL_SECONDS;
  let app: INestApplication<App>;

  async function initApp() {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture);
    await app.init();
  }

  afterEach(async () => {
    if (originalAuthRateLimitMaxRequests === undefined) {
      delete process.env.AUTH_RATE_LIMIT_MAX_REQUESTS;
    } else {
      process.env.AUTH_RATE_LIMIT_MAX_REQUESTS =
        originalAuthRateLimitMaxRequests;
    }

    if (originalAuthRateLimitWindowMs === undefined) {
      delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = originalAuthRateLimitWindowMs;
    }

    if (originalAuthSessionTtlSeconds === undefined) {
      delete process.env.AUTH_SESSION_TTL_SECONDS;
    } else {
      process.env.AUTH_SESSION_TTL_SECONDS = originalAuthSessionTtlSeconds;
    }

    if (app) {
      await app.close();
    }
  });

  it('rate-limits oauth initiation endpoints', async () => {
    process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = '1';
    process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
    await initApp();

    await request(app.getHttpServer())
      .get('/api/auth/oauth/google/start')
      .expect(200);

    await request(app.getHttpServer())
      .get('/api/auth/oauth/google/start')
      .expect(429)
      .expect((res) => {
        expect(res.body.code).toBe('RATE_LIMITED');
      });
  });

  it('expires sessions using AUTH_SESSION_TTL_SECONDS', async () => {
    process.env.AUTH_SESSION_TTL_SECONDS = '1';
    await initApp();

    const registerResponse = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'ttl@example.com' })
      .expect(201);

    const token = registerResponse.body.access_token as string;
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app.getHttpServer())
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });
});

describe('Strategy persistence and versioning (e2e)', () => {
  let app: INestApplication<App>;
  let audit: AuditService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture) as INestApplication<App>;
    await app.init();
    audit = app.get(AuditService);
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerAndGetToken(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email })
      .expect(201);
    return response.body.access_token as string;
  }

  function strategyBody(overrides: Record<string, unknown> = {}) {
    return {
      name: 'SMA Cross Long',
      description: 'Fast/slow SMA cross',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: { indicators: [] },
      ...overrides,
    };
  }

  it('creates version one, audits it, and reads it back for the owner', async () => {
    const token = await registerAndGetToken('strategist@example.com');
    const authorization = `Bearer ${token}`;

    const createResponse = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ name: '  SMA Cross Long  ' }))
      .expect(201);

    expect(createResponse.body).toMatchObject({
      name: 'SMA Cross Long',
      description: 'Fast/slow SMA cross',
      asset_type: 'EQUITY',
      symbol_scope: 'SINGLE',
      timeframe: '1d',
      is_active: true,
      version_number: 1,
      definition: { indicators: [] },
    });
    expect(createResponse.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(
      new Date(createResponse.body.created_at as string).toISOString(),
    ).toBe(createResponse.body.created_at);

    await request(app.getHttpServer())
      .get(`/api/strategies/${createResponse.body.id as string}`)
      .set('Authorization', authorization)
      .expect(200)
      .expect((res) => {
        expect(res.body).toEqual(createResponse.body);
      });

    expect(audit.getInMemoryEventsForTests()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'strategy.created',
          payload: {
            strategy_id: createResponse.body.id,
            name: 'SMA Cross Long',
          },
        }),
      ]),
    );
  });

  it('enforces normalized name uniqueness per user and hides cross-user ids', async () => {
    const ownerToken = await registerAndGetToken('owner@example.com');
    const otherToken = await registerAndGetToken('other@example.com');

    const createResponse = await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(strategyBody({ name: 'Café Momentum' }))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(strategyBody({ name: ' cafe momentum ' }))
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('CONFLICT');
      });

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', `Bearer ${otherToken}`)
      .send(strategyBody({ name: 'CAFE MOMENTUM' }))
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/strategies/${createResponse.body.id as string}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404)
      .expect((res) => {
        expect(res.body.code).toBe('NOT_FOUND');
      });
  });

  it('matches MySQL Unicode name-conflict behavior in seed mode', async () => {
    const token = await registerAndGetToken('unicode-owner@example.com');
    const authorization = `Bearer ${token}`;

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ name: 'Straße Momentum' }))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ name: 'Strasse Momentum' }))
      .expect(409)
      .expect((res) => {
        expect(res.body.code).toBe('CONFLICT');
      });
  });

  it('returns RFC 7807 validation errors for invalid strategy contracts', async () => {
    const token = await registerAndGetToken('validation@example.com');
    const authorization = `Bearer ${token}`;

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ timeframe: '1h' }))
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ definition: [] }))
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send({ ...strategyBody(), unexpected: true })
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .post('/api/strategies')
      .set('Authorization', authorization)
      .send(strategyBody({ name: 123, description: 456 }))
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });

    await request(app.getHttpServer())
      .get('/api/strategies/not-a-uuid')
      .set('Authorization', authorization)
      .expect(400)
      .expect((res) => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
  });

  it('requires authentication for strategy reads and writes', async () => {
    await request(app.getHttpServer())
      .post('/api/strategies')
      .send(strategyBody())
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });

    await request(app.getHttpServer())
      .get(`/api/strategies/${crypto.randomUUID()}`)
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });
});

describe('Market data symbols (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/symbols/:symbol returns a canonical symbol', () => {
    return request(app.getHttpServer())
      .get('/api/symbols/aapl')
      .expect(200)
      .expect((res) => {
        const body = res.body as Record<string, unknown>;
        expect(body).toMatchObject({
          symbol: 'AAPL',
          name: 'Apple Inc.',
          asset_type: 'EQUITY',
          exchange: 'NASDAQ',
          currency: 'USD',
          is_active: true,
        });
      });
  });

  it('GET /api/symbols/search supports typeahead filters', () => {
    return request(app.getHttpServer())
      .get('/api/symbols/search')
      .query({ q: 'usd', asset_type: 'CRYPTO', limit: 1 })
      .expect(200)
      .expect((res) => {
        const body = res.body as Array<Record<string, unknown>>;
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          symbol: 'BTC-USD',
          asset_type: 'CRYPTO',
          base_asset: 'BTC',
          quote_asset: 'USD',
        });
      });
  });

  it('GET /api/symbols/:symbol returns RFC 7807 NOT_FOUND for unknown symbols', () => {
    return request(app.getHttpServer())
      .get('/api/symbols/NOPE')
      .expect(404)
      .expect((res) => {
        const body = res.body as Record<string, unknown>;
        expect(body.code).toBe('NOT_FOUND');
      });
  });
});

describe('Market data candles (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function expectProblem(
    body: Record<string, unknown>,
    status: number,
    code: string,
  ): void {
    expect(body).toMatchObject({ status, code });
    expect(body.type).toMatch(/^https:\/\/bitstockerz\.dev\/errors\//);
    expect(typeof body.title).toBe('string');
    expect(typeof body.detail).toBe('string');
    expect(typeof body.instance).toBe('string');
    expect(typeof body.requestId).toBe('string');
  }

  function expectValidationProblem(body: Record<string, unknown>): void {
    expectProblem(body, 400, 'VALIDATION_ERROR');
    expect(Array.isArray(body.fieldErrors)).toBe(true);
    expect((body.fieldErrors as unknown[]).length).toBeGreaterThan(0);
  }

  function expectNumericCandleValues(candle: Record<string, unknown>): void {
    for (const field of ['open', 'high', 'low', 'close', 'volume']) {
      expect(typeof candle[field]).toBe('number');
    }
  }

  it('GET equities/candles returns the seeded daily shape in default ascending order', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/equities/candles')
      .query({
        symbol: ' aapl ',
        start: SEED_EQUITY_SAMPLE.start,
        end: SEED_EQUITY_SAMPLE.end,
      })
      .expect(200)
      .expect((res) => {
        const body = res.body as Array<Record<string, unknown>>;
        expect(body).toHaveLength(5);
        expect(body.map((candle) => candle.date)).toEqual(
          SEED_EQUITY_SAMPLE.dates,
        );
        expect(body[0].date).toBe(SEED_EQUITY_SAMPLE.dates[0]);
        expect(Object.keys(body[0]).sort()).toEqual([
          'close',
          'date',
          'high',
          'low',
          'open',
          'volume',
        ]);
        expectNumericCandleValues(body[0]);
      });
  });

  it('GET equities/candles applies descending order and limit', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/equities/candles')
      .query({
        symbol: 'AAPL',
        start: SEED_EQUITY_SAMPLE.start,
        end: SEED_EQUITY_SAMPLE.end,
        order: 'desc',
        limit: 2,
      })
      .expect(200)
      .expect((res) => {
        const body = res.body as Array<Record<string, unknown>>;
        const dates = SEED_EQUITY_SAMPLE.dates;
        expect(body.map((candle) => candle.date)).toEqual([
          dates[dates.length - 1],
          dates[dates.length - 2],
        ]);
      });
  });

  it('GET crypto/candles returns seeded daily candles with date fields', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/crypto/candles')
      .query({
        symbol: 'btc-usd',
        interval: '1d',
        start: SEED_CRYPTO_DAILY_SAMPLE.start,
        end: SEED_CRYPTO_DAILY_SAMPLE.end,
      })
      .expect(200)
      .expect((res) => {
        const body = res.body as Array<Record<string, unknown>>;
        expect(body).toHaveLength(3);
        expect(body.map((candle) => candle.date)).toEqual(
          SEED_CRYPTO_DAILY_SAMPLE.dates,
        );
        expect(body[0].date).toBe(SEED_CRYPTO_DAILY_SAMPLE.dates[0]);
        expectNumericCandleValues(body[0]);
        expect(body[0]).not.toHaveProperty('timestamp');
      });
  });

  it('GET crypto/candles returns seeded hourly candles with UTC timestamps', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/crypto/candles')
      .query({
        symbol: 'BTC-USD',
        interval: '1h',
        start: SEED_CRYPTO_HOURLY_SAMPLE.start,
        end: SEED_CRYPTO_HOURLY_SAMPLE.end,
      })
      .expect(200)
      .expect((res) => {
        const body = res.body as Array<Record<string, unknown>>;
        expect(body).toHaveLength(3);
        expect(body.map((candle) => candle.timestamp)).toEqual(
          SEED_CRYPTO_HOURLY_SAMPLE.timestamps,
        );
        expect(body[0].timestamp).toBe(SEED_CRYPTO_HOURLY_SAMPLE.timestamps[0]);
        expectNumericCandleValues(body[0]);
        expect(body[0]).not.toHaveProperty('date');
      });
  });

  it('returns an empty array when a valid range has no bars', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/equities/candles')
      .query({ symbol: 'AAPL', start: '2025-01-01', end: '2025-01-31' })
      .expect(200)
      .expect([]);
  });

  it('returns RFC 7807 NOT_FOUND for an unknown symbol', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/crypto/candles')
      .query({
        symbol: 'NOPE-USD',
        interval: '1d',
        start: '2026-01-01',
        end: '2026-01-03',
      })
      .expect(404)
      .expect((res) => {
        expectProblem(res.body as Record<string, unknown>, 404, 'NOT_FOUND');
      });
  });

  it('returns VALIDATION_ERROR when a crypto symbol is sent to the equity endpoint', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/equities/candles')
      .query({
        symbol: 'BTC-USD',
        start: '2026-01-05',
        end: '2026-01-09',
      })
      .expect(400)
      .expect((res) => {
        expectValidationProblem(res.body as Record<string, unknown>);
      });
  });

  it('returns VALIDATION_ERROR when an equity symbol is sent to the crypto endpoint', () => {
    return request(app.getHttpServer())
      .get('/api/market-data/crypto/candles')
      .query({
        symbol: 'AAPL',
        interval: '1d',
        start: '2026-01-01',
        end: '2026-01-03',
      })
      .expect(400)
      .expect((res) => {
        expectValidationProblem(res.body as Record<string, unknown>);
      });
  });

  it.each([
    {
      name: 'missing crypto interval',
      path: '/api/market-data/crypto/candles',
      query: {
        symbol: 'BTC-USD',
        start: '2026-01-01',
        end: '2026-01-03',
      },
    },
    {
      name: 'reversed equity range',
      path: '/api/market-data/equities/candles',
      query: {
        symbol: 'AAPL',
        start: '2026-02-01',
        end: '2026-01-01',
      },
    },
    {
      name: 'equity datetime instead of date',
      path: '/api/market-data/equities/candles',
      query: {
        symbol: 'AAPL',
        start: '2026-01-05T00:00:00.000Z',
        end: '2026-01-09',
      },
    },
    {
      name: 'daily crypto datetime instead of date',
      path: '/api/market-data/crypto/candles',
      query: {
        symbol: 'BTC-USD',
        interval: '1d',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-03',
      },
    },
    {
      name: 'hourly crypto date without time',
      path: '/api/market-data/crypto/candles',
      query: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15',
        end: '2026-01-15T02:00:00.000Z',
      },
    },
    {
      name: 'hourly crypto datetime without timezone',
      path: '/api/market-data/crypto/candles',
      query: {
        symbol: 'BTC-USD',
        interval: '1h',
        start: '2026-01-15T00:00:00',
        end: '2026-01-15T02:00:00.000Z',
      },
    },
    {
      name: 'limit below minimum',
      path: '/api/market-data/equities/candles',
      query: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        limit: 0,
      },
    },
    {
      name: 'limit above maximum',
      path: '/api/market-data/equities/candles',
      query: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        limit: 5001,
      },
    },
    {
      name: 'invalid order',
      path: '/api/market-data/equities/candles',
      query: {
        symbol: 'AAPL',
        start: '2026-01-05',
        end: '2026-01-09',
        order: 'sideways',
      },
    },
  ])('returns a query validation problem for $name', ({ path, query }) => {
    return request(app.getHttpServer())
      .get(path)
      .query(query)
      .expect(400)
      .expect((res) => {
        expectValidationProblem(res.body as Record<string, unknown>);
      });
  });
});

describe('Jobs and ingestion (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  async function registerAndGetToken(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'ingestion@example.com', display_name: 'Ingestion User' })
      .expect(201);

    return response.body.access_token as string;
  }

  it('runs equity ingestion and returns a completed job', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/api/market-data/ingestion/equity')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbol: 'AAPL' })
      .expect(201)
      .expect((res) => {
        const body = res.body as Record<string, unknown>;
        expect(body.job_type).toBe('equity_daily_import');
        expect(body.status).toBe('completed');
        expect(body.payload).toMatchObject({
          symbol: 'AAPL',
          imported_equity_bars: 40,
        });
        expect(body.payload).toHaveProperty('sanity');
        expect(
          (body.payload as { sanity: { checked: number } }).sanity.checked,
        ).toBeGreaterThan(0);
      });
  });

  it('runs crypto ingestion for daily and hourly intervals', async () => {
    const token = await registerAndGetToken();

    await request(app.getHttpServer())
      .post('/api/market-data/ingestion/crypto')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbol: 'BTC-USD', intervals: ['1d', '1h'] })
      .expect(201)
      .expect((res) => {
        const body = res.body as Record<string, unknown>;
        expect(body.job_type).toBe('crypto_import');
        expect(body.status).toBe('completed');
        expect(body.payload).toMatchObject({
          symbol: 'BTC-USD',
          imported_crypto_daily_bars: 30,
          imported_crypto_hourly_bars: 48,
        });
      });
  });

  it('GET /api/jobs/:id returns the job for the authenticated owner', async () => {
    const token = await registerAndGetToken();

    const createResponse = await request(app.getHttpServer())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ job_type: 'equity_daily_import' })
      .expect(201);

    const jobId = createResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.id).toBe(jobId);
        expect(res.body.status).toBe('completed');
      });
  });

  it('rejects unauthenticated job requests', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .send({ job_type: 'equity_daily_import' })
      .expect(401)
      .expect((res) => {
        expect(res.body.code).toBe('UNAUTHORIZED');
      });
  });
});

describe('Market data health and metrics (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = createApp(moduleFixture) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/market-data/health returns seed-mode health snapshot', async () => {
    await request(app.getHttpServer())
      .get('/api/market-data/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.source).toBe('seed');
        expect(['ok', 'degraded', 'unhealthy']).toContain(res.body.status);
        expect(Array.isArray(res.body.series)).toBe(true);
        expect(res.body.series).toHaveLength(3);
        expect(res.body.sanity).toMatchObject({
          checked: expect.any(Number),
          invalid: expect.any(Number),
          issues: expect.any(Array),
        });
      });
  });

  it('GET /api/metrics returns a JSON summary snapshot', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);

    await request(app.getHttpServer())
      .get('/api/metrics')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('http');
        expect(res.body).toHaveProperty('jobs');
        expect(res.body).toHaveProperty('errors_by_domain');
        expect(res.body.http.request_count).toBeGreaterThanOrEqual(1);
      });
  });
});
