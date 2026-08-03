import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import { API_SCHEMAS } from './openapi.schemas';
import { BEARER_AUTH_SCHEME } from './openapi.decorators';

export const OPENAPI_DOCS_PATH = '/api/docs';
export const OPENAPI_JSON_PATH = '/api/openapi.json';
export const OPENAPI_YAML_PATH = '/api/openapi.yaml';

export function configureOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('BitStockerz API')
    .setDescription(
      [
        'HTTP API for BitStockerz authentication, market data, strategies, backtests, and paper trading.',
        '',
        'All errors use RFC 7807 Problem Details. Supply an optional `x-request-id` header to correlate a request with logs.',
        '',
        'Market-data reads are backed by deterministic seed data when `DATABASE_URL` is not configured and by local MySQL rows when it is configured. No live market-data provider is wired yet.',
      ].join('\n'),
    )
    .setVersion('0.0.1')
    .addServer('http://localhost:4000', 'Local API')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque session token',
        description:
          'Use the access_token returned by a successful authentication flow.',
      },
      BEARER_AUTH_SCHEME,
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ...API_SCHEMAS,
  };
  linkCanonicalRequestSchemas(document);
  addRequestIdContract(document);

  SwaggerModule.setup(OPENAPI_DOCS_PATH, app, document, {
    customSiteTitle: 'BitStockerz API Docs',
    jsonDocumentUrl: OPENAPI_JSON_PATH,
    yamlDocumentUrl: OPENAPI_YAML_PATH,
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
  });

  return document;
}

function linkCanonicalRequestSchemas(document: OpenAPIObject): void {
  const schemas = document.components?.schemas;
  if (!schemas) {
    return;
  }

  for (const schemaName of [
    'CreateStrategyDto',
    'UpdateStrategyDto',
    'ValidateStrategyDto',
  ]) {
    const schema = schemas[schemaName];
    if (!schema || '$ref' in schema || !schema.properties?.definition) {
      continue;
    }
    schema.properties.definition = {
      $ref: '#/components/schemas/StrategyDefinition',
    };
  }
}

function addRequestIdContract(document: OpenAPIObject): void {
  for (const path of Object.values(document.paths)) {
    for (const method of [
      'get',
      'put',
      'post',
      'delete',
      'patch',
      'options',
      'head',
      'trace',
    ] as const) {
      const operation = path[method];
      if (!operation) {
        continue;
      }
      operation.parameters ??= [];
      operation.parameters.unshift({
        name: 'x-request-id',
        in: 'header',
        required: false,
        description:
          'Optional caller-provided correlation ID. The API echoes or generates a requestId.',
        schema: { type: 'string' },
      });
      for (const response of Object.values(operation.responses)) {
        if (!response || '$ref' in response) {
          continue;
        }
        response.headers ??= {};
        response.headers['x-request-id'] = {
          description: 'Correlation ID used for this request.',
          schema: { type: 'string' },
        };
      }
    }
  }
}
