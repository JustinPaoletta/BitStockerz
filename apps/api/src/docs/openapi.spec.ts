import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import {
  configureOpenApi,
  OPENAPI_DOCS_PATH,
  OPENAPI_JSON_PATH,
  OPENAPI_YAML_PATH,
} from './openapi';
import { BEARER_AUTH_SCHEME } from './openapi.decorators';

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

const EXPECTED_OPERATIONS: Record<string, HttpMethod[]> = {
  '/api/health/live': ['get'],
  '/api/health/ready': ['get'],
  '/api/auth/register': ['post'],
  '/api/auth/login': ['post'],
  '/api/auth/webauthn/register/options': ['post'],
  '/api/auth/webauthn/register/verify': ['post'],
  '/api/auth/webauthn/login/options': ['post'],
  '/api/auth/webauthn/login/verify': ['post'],
  '/api/auth/oauth/google/start': ['get'],
  '/api/auth/oauth/apple/start': ['get'],
  '/api/auth/oauth/google/callback': ['get'],
  '/api/auth/oauth/apple/callback': ['get', 'post'],
  '/api/auth/logout': ['post'],
  '/api/auth/me': ['get'],
  '/api/me': ['get', 'patch'],
  '/api/symbols/search': ['get'],
  '/api/symbols/{symbol}': ['get'],
  '/api/market-data/equities/candles': ['get'],
  '/api/market-data/crypto/candles': ['get'],
  '/api/market-data/ingestion/equity': ['post'],
  '/api/market-data/ingestion/crypto': ['post'],
  '/api/market-data/health': ['get'],
  '/api/metrics': ['get'],
  '/api/jobs': ['post'],
  '/api/jobs/{id}': ['get'],
  '/api/strategies/indicators': ['get'],
  '/api/strategies': ['get', 'post'],
  '/api/strategies/validate': ['post'],
  '/api/strategies/{id}': ['get', 'put', 'delete'],
  '/api/backtests': ['get', 'post'],
  '/api/backtests/{id}': ['get'],
};

const PROTECTED_OPERATIONS = new Set([
  'post /api/auth/logout',
  'get /api/auth/me',
  'get /api/me',
  'patch /api/me',
  'post /api/market-data/ingestion/equity',
  'post /api/market-data/ingestion/crypto',
  'post /api/jobs',
  'get /api/jobs/{id}',
  'get /api/strategies',
  'post /api/strategies',
  'post /api/strategies/validate',
  'get /api/strategies/{id}',
  'put /api/strategies/{id}',
  'delete /api/strategies/{id}',
  'get /api/backtests',
  'post /api/backtests',
  'get /api/backtests/{id}',
]);

describe('OpenAPI contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents every shipped product operation with summaries and responses', () => {
    const document = configureOpenApi(app);

    expect(Object.keys(document.paths).sort()).toEqual(
      Object.keys(EXPECTED_OPERATIONS).sort(),
    );
    expect(document.paths['/api']).toBeUndefined();
    expect(document.paths['/api/error-test/{path}']).toBeUndefined();

    for (const [path, methods] of Object.entries(EXPECTED_OPERATIONS)) {
      for (const method of methods) {
        const operation = document.paths[path]?.[method];
        expect(operation).toBeDefined();
        expect(operation?.summary).toBeTruthy();
        expect(operation?.tags?.length).toBeGreaterThan(0);
        expect(Object.keys(operation?.responses ?? {})).toEqual(
          expect.arrayContaining([expect.stringMatching(/^2\d\d$/)]),
        );
        expect(operation?.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'x-request-id',
              in: 'header',
              required: false,
            }),
          ]),
        );
        for (const response of Object.values(operation?.responses ?? {})) {
          if (!response || '$ref' in response) {
            continue;
          }
          expect(response.headers).toHaveProperty('x-request-id');
        }

        const operationKey = `${method} ${path}`;
        if (PROTECTED_OPERATIONS.has(operationKey)) {
          expect(operation?.security).toEqual([{ [BEARER_AUTH_SCHEME]: [] }]);
          expect(operation?.responses).toHaveProperty('401');
        }
      }
    }
  });

  it('contains only resolvable local schema references', () => {
    const document = configureOpenApi(app);
    const serialized = JSON.stringify(document);
    const references = [
      ...serialized.matchAll(/"\$ref":"#\/components\/schemas\/([^"/]+)"/g),
    ].map((match) => match[1]);

    expect(references.length).toBeGreaterThan(0);
    for (const schemaName of references) {
      expect(document.components?.schemas).toHaveProperty(schemaName);
    }
  });

  it('serves interactive, JSON, and YAML documentation', async () => {
    configureOpenApi(app);
    await app.init();

    await request(app.getHttpServer())
      .get(OPENAPI_DOCS_PATH)
      .expect(200)
      .expect('content-type', /html/);
    await request(app.getHttpServer())
      .get(OPENAPI_JSON_PATH)
      .expect(200)
      .expect('content-type', /json/)
      .expect((response) => {
        expect(response.body.openapi).toBe('3.0.0');
        expect(response.body.info.title).toBe('BitStockerz API');
      });
    await request(app.getHttpServer())
      .get(OPENAPI_YAML_PATH)
      .expect(200)
      .expect('content-type', /ya?ml|text\/plain/);
  });
});
