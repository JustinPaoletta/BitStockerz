import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/errors/http-exception.filter';
import { AppLogger } from '../src/common/logging/app-logger';

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
    return request(app.getHttpServer()).get('/api').expect(200).expect('Hello World!');
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

  const rfc7807Fields = ['type', 'title', 'status', 'detail', 'instance', 'code', 'requestId'];

  function expectRfc7807Shape(body: Record<string, unknown>) {
    rfc7807Fields.forEach((field) => {
      expect(body).toHaveProperty(field);
    });
    expect(body.type).toMatch(/^https:\/\/bitstockerz\.dev\/errors\//);
    expect(typeof body.requestId).toBe('string');
    expect((body.requestId as string).length).toBeGreaterThan(0);
  }

  it('malformed request body returns 400 with VALIDATION_ERROR, fieldErrors, requestId', () => {
    return request(app.getHttpServer())
      .post('/api/strategies')
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

  it('all error responses have RFC 7807 base fields plus code and requestId', () => {
    return request(app.getHttpServer())
      .post('/api/strategies')
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
