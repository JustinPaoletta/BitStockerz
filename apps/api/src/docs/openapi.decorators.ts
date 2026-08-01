import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  type ApiResponseSchemaHost,
} from '@nestjs/swagger';

export const BEARER_AUTH_SCHEME = 'bearer-session';

export type DocumentedErrorStatus =
  400 | 401 | 403 | 404 | 409 | 429 | 500 | 504;

interface ApiEndpointOptions {
  summary: string;
  description?: string;
  responseDescription: string;
  responseSchema?: ApiResponseSchemaHost['schema'];
  status?: number;
  errors?: DocumentedErrorStatus[];
  authenticated?: boolean;
}

const ERROR_DESCRIPTIONS: Record<DocumentedErrorStatus, string> = {
  400: 'Invalid request. Returns RFC 7807 problem details.',
  401: 'Missing, malformed, expired, or unknown bearer session.',
  403: 'Authenticated user is not allowed to perform the operation.',
  404: 'Requested resource was not found or is not visible to this user.',
  409: 'Request conflicts with the current resource state.',
  429: 'Request rate limit exceeded.',
  500: 'Unexpected internal error. Quote the returned requestId when reporting it.',
  504: 'Operation exceeded its configured execution deadline.',
};

export function apiSchemaRef(name: string): ApiResponseSchemaHost['schema'] {
  return { $ref: `#/components/schemas/${name}` };
}

export function apiArrayOf(name: string): ApiResponseSchemaHost['schema'] {
  return { type: 'array', items: apiSchemaRef(name) };
}

export function ApiEndpoint(options: ApiEndpointOptions) {
  const status = options.status ?? 200;
  const successResponse = options.responseSchema
    ? ApiResponse({
        status,
        description: options.responseDescription,
        schema: options.responseSchema,
      })
    : ApiResponse({ status, description: options.responseDescription });
  const errors = [...new Set(options.errors ?? [])].map((errorStatus) =>
    ApiResponse({
      status: errorStatus,
      description: ERROR_DESCRIPTIONS[errorStatus],
      schema: apiSchemaRef('ProblemDetails'),
    }),
  );

  return applyDecorators(
    ApiOperation({
      summary: options.summary,
      ...(options.description ? { description: options.description } : {}),
    }),
    ...(options.authenticated ? [ApiBearerAuth(BEARER_AUTH_SCHEME)] : []),
    successResponse,
    ...errors,
  );
}
