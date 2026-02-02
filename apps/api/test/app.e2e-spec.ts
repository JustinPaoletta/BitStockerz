import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalHttpExceptionFilter } from '../src/common/errors/http-exception.filter';

function createApp(module: TestingModule): INestApplication {
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
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
