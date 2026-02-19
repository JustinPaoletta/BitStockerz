import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';
import { REQUEST_ID_HEADER, REQUEST_ID_PROP } from '../middleware/request-id.middleware';
import type { LoggingConfig } from '../../config/app-config.service';

type RequestWithIds = IncomingMessage & {
  id?: string;
  [REQUEST_ID_PROP]?: string;
};

type TransportConfig = Params['pinoHttp'] extends infer T
  ? T extends { transport?: infer Transport }
    ? Transport
    : undefined
  : undefined;

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

  if (config.nodeEnv === 'production') {
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

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

function resolveRequestId(req: RequestWithIds): string {
  const headerId = normalizeHeader(req.headers[REQUEST_ID_HEADER] as string | string[] | undefined);
  const existingId = req[REQUEST_ID_PROP] ?? req.id;
  const id = headerId ?? (typeof existingId === 'string' && existingId.length > 0 ? existingId : randomUUID());
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
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie'],
        remove: true,
      },
      transport: buildTransport(config),
    },
  };
}
