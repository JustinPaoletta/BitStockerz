import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import type { StdSerializedResults } from 'pino-http';
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PROP,
} from '../middleware/request-id.middleware';
import type { LoggingConfig } from '../../config/app-config.service';

type RequestWithIds = IncomingMessage & {
  id?: string;
  originalUrl?: string;
  [REQUEST_ID_PROP]?: string;
};

type TransportConfig = Params['pinoHttp'] extends infer T
  ? T extends { transport?: infer Transport }
    ? Transport
    : undefined
  : undefined;

export function isOAuthRequest(url: string | undefined): boolean {
  return /^\/(?:api\/)?auth\/oauth(?:\/|$)/i.test(
    url?.split(/[?#]/, 1)[0] ?? '',
  );
}

function serializeRequest(request: StdSerializedResults['req']) {
  const { query, params, ...serialized } = request;
  const safeRequest = { ...serialized, headers: { ...request.headers } };
  if (isOAuthRequest(request.url)) {
    // OAuth codes and state can arrive in either a query or an Apple form post.
    // Keep the route useful for diagnosis without serializing identity payloads.
    safeRequest.url = request.url.split(/[?#]/, 1)[0];
    return safeRequest;
  }
  return { ...safeRequest, query, params };
}

function serializeResponse(response: StdSerializedResults['res']) {
  // Every redirect can carry a handoff fragment, provider state, or a code.
  const headers = { ...response.headers };
  delete headers.location;
  delete headers.Location;
  return { ...response, headers };
}

function buildTransport(config: LoggingConfig): TransportConfig {
  if (config.writeToFile) {
    return {
      target: 'pino/file',
      options: {
        destination: config.filePath,
        mkdir: true,
      },
    };
  }

  if (config.nodeEnv !== 'development') {
    return undefined;
  }

  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      singleLine: true,
      ignore: 'pid,hostname',
    },
  };
}

function normalizeHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestId(req: RequestWithIds): string {
  const headerId = normalizeHeader(req.headers[REQUEST_ID_HEADER]);
  const existingId = req[REQUEST_ID_PROP] ?? req.id;
  const id =
    headerId ??
    (typeof existingId === 'string' && existingId.length > 0
      ? existingId
      : randomUUID());
  req.id = id;
  req[REQUEST_ID_PROP] = id;
  return id;
}

export function buildPinoLoggerOptions(config: LoggingConfig): Params {
  return {
    forRoutes: [{ path: '*path', method: RequestMethod.ALL }],
    pinoHttp: {
      level: config.level,
      genReqId: resolveRequestId,
      customProps: (req: RequestWithIds) => ({
        requestId: req[REQUEST_ID_PROP] ?? req.id,
      }),
      serializers: {
        req: serializeRequest,
        res: serializeResponse,
      },
      customErrorObject: (
        req: RequestWithIds,
        _res,
        _error,
        value: Record<string, unknown>,
      ) =>
        isOAuthRequest(req.originalUrl ?? req.url)
          ? {
              ...value,
              err: { type: 'Error', message: 'OAuth request failed' },
            }
          : value,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.referer',
          'req.query.code',
          'req.query.state',
          'req.query.user',
          'req.query.email',
          'req.query.sub',
          'req.body',
          'res.headers.location',
          'res.headers.Location',
          'res.headers["set-cookie"]',
          'code',
          'state',
          'verifier',
          'code_challenge',
          'access_token',
          'id_token',
        ],
        remove: true,
      },
      transport: buildTransport(config),
    },
  };
}
