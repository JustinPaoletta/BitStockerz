import { RequestMethod } from '@nestjs/common';
import type { LoggingConfig } from '../../config/app-config.service';

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-123'),
}));

import { buildPinoLoggerOptions } from './pino.config';

describe('buildPinoLoggerOptions', () => {
  const baseConfig: LoggingConfig = {
    level: 'info',
    nodeEnv: 'development',
    writeToFile: false,
    filePath: 'logs/api.log',
  };

  it('sets default routes and redaction', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    expect(options.forRoutes).toEqual([{ path: '*path', method: RequestMethod.ALL }]);
    expect(options.pinoHttp?.redact).toEqual({
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      remove: true,
    });
  });

  it('defaults to info level and enables dev transport', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    expect(options.pinoHttp?.level).toBe('info');
    expect(options.pinoHttp?.transport).toBeDefined();
  });

  it('disables transport in production and respects log level', () => {
    const options = buildPinoLoggerOptions({
      ...baseConfig,
      nodeEnv: 'production',
      level: 'warn',
    });
    expect(options.pinoHttp?.level).toBe('warn');
    expect(options.pinoHttp?.transport).toBeUndefined();
  });

  it('uses file transport when configured', () => {
    const options = buildPinoLoggerOptions({
      ...baseConfig,
      writeToFile: true,
    });
    expect(options.pinoHttp?.transport).toEqual({
      target: 'pino/file',
      options: {
        destination: 'logs/api.log',
        mkdir: true,
      },
    });
  });

  it('uses custom file path when configured', () => {
    const options = buildPinoLoggerOptions({
      ...baseConfig,
      writeToFile: true,
      filePath: '/tmp/bitstockerz-api.log',
    });
    expect(options.pinoHttp?.transport).toEqual({
      target: 'pino/file',
      options: {
        destination: '/tmp/bitstockerz-api.log',
        mkdir: true,
      },
    });
  });

  it('reuses header request id and sets request properties', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const genReqId = options.pinoHttp?.genReqId as (req: any) => string;
    const req = { headers: { 'x-request-id': 'header-id' } };
    const id = genReqId(req);
    expect(id).toBe('header-id');
    expect(req.id).toBe('header-id');
    expect(req.requestId).toBe('header-id');
  });

  it('reuses existing request id when header is missing', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const genReqId = options.pinoHttp?.genReqId as (req: any) => string;
    const req = { headers: {}, requestId: 'existing-id' };
    const id = genReqId(req);
    expect(id).toBe('existing-id');
    expect(req.id).toBe('existing-id');
  });

  it('generates a new request id when none exists', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const genReqId = options.pinoHttp?.genReqId as (req: any) => string;
    const req = { headers: {} };
    const id = genReqId(req);
    expect(id).toBe('uuid-123');
    expect(req.id).toBe('uuid-123');
    expect(req.requestId).toBe('uuid-123');
  });

  it('exposes requestId in custom props', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const customProps = options.pinoHttp?.customProps as (req: any) => Record<string, unknown>;
    const req = { headers: {}, requestId: 'req-1' };
    expect(customProps(req).requestId).toBe('req-1');
  });

  it('uses req.id when requestId is missing', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const customProps = options.pinoHttp?.customProps as (req: any) => Record<string, unknown>;
    const req = { headers: {}, id: 'req-2' };
    expect(customProps(req).requestId).toBe('req-2');
  });
});
