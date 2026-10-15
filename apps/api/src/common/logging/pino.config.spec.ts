import { RequestMethod } from '@nestjs/common';
import type { LoggingConfig } from '../../config/app-config.service';
import express from 'express';
import pinoHttp from 'pino-http';
import request from 'supertest';

jest.mock('crypto', () => ({
  ...jest.requireActual<typeof import('crypto')>('crypto'),
  randomUUID: jest.fn(() => 'uuid-123'),
}));

import { buildPinoLoggerOptions, isOAuthRequest } from './pino.config';

describe('buildPinoLoggerOptions', () => {
  const baseConfig: LoggingConfig = {
    level: 'info',
    nodeEnv: 'development',
    writeToFile: false,
    filePath: 'logs/api.log',
  };

  it('sets default routes and redaction', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    expect(options.forRoutes).toEqual([
      { path: '*path', method: RequestMethod.ALL },
    ]);
    expect(options.pinoHttp?.redact).toEqual({
      paths: expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body',
        'res.headers.location',
        'verifier',
      ]),
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

  it('disables worker-backed pretty transport in tests', () => {
    const options = buildPinoLoggerOptions({
      ...baseConfig,
      nodeEnv: 'test',
    });

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
    const customProps = options.pinoHttp?.customProps as (
      req: any,
    ) => Record<string, unknown>;
    const req = { headers: {}, requestId: 'req-1' };
    expect(customProps(req).requestId).toBe('req-1');
  });

  it('uses req.id when requestId is missing', () => {
    const options = buildPinoLoggerOptions(baseConfig);
    const customProps = options.pinoHttp?.customProps as (
      req: any,
    ) => Record<string, unknown>;
    const req = { headers: {}, id: 'req-2' };
    expect(customProps(req).requestId).toBe('req-2');
  });

  it('recognizes OAuth routes with either API prefix and avoids unrelated prefixes', () => {
    expect(isOAuthRequest('/auth/oauth/google/callback?code=secret')).toBe(
      true,
    );
    expect(isOAuthRequest('/api/auth/oauth')).toBe(true);
    expect(isOAuthRequest('/API/AUTH/OAUTH/GOOGLE/CALLBACK')).toBe(true);
    expect(isOAuthRequest('/api/auth/oauth-like')).toBe(false);
    expect(isOAuthRequest('/api/auth/webauthn/login/verify')).toBe(false);
    expect(isOAuthRequest(undefined)).toBe(false);
  });
});

describe('OAuth HTTP logging', () => {
  function createLoggedApp() {
    const chunks: string[] = [];
    const options = buildPinoLoggerOptions({
      level: 'info',
      nodeEnv: 'test',
      writeToFile: false,
      filePath: 'unused.log',
    }).pinoHttp;
    if (!options || Array.isArray(options)) {
      throw new Error('Expected pino HTTP options');
    }
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(
      pinoHttp(options, {
        write: (chunk: string) => {
          chunks.push(chunk);
        },
      }),
    );
    return {
      app,
      output: () => chunks.join(''),
      records: () => chunks.map((chunk) => JSON.parse(chunk)),
    };
  }

  it('removes beta gateway and monitoring keys from actual HTTP logs', async () => {
    const { app, output } = createLoggedApp();
    app.get('/api/symbols', (_req, res) => res.json({ symbols: [] }));
    await request(app)
      .get('/api/symbols')
      .set('x-bitstockerz-beta-key', 'private-beta-proxy-value')
      .set('x-bitstockerz-monitor-key', 'private-beta-monitor-value')
      .expect(200);
    expect(output()).not.toContain('private-beta-proxy-value');
    expect(output()).not.toContain('private-beta-monitor-value');
  });

  it('logs Google callback routes without codes, state, query identity, headers, or redirect secrets', async () => {
    const { app, output, records } = createLoggedApp();
    app.get('/api/auth/oauth/google/callback', (_req, res) => {
      res.setHeader('Set-Cookie', 'session=cookie-session-secret');
      res.redirect(
        'https://web.example/auth/oauth/callback#code=handoff-secret&state=state-secret',
      );
    });

    await request(app)
      .get('/api/auth/oauth/google/callback')
      .query({
        code: 'provider-code-secret',
        state: 'state-secret',
        email: 'private-email@example.com',
        sub: 'private-subject',
        unexpected: 'unexpected-secret',
      })
      .set('Authorization', 'Bearer bearer-secret')
      .set('Cookie', 'session=request-cookie-secret')
      .set('Referer', 'https://provider.example?code=referer-secret')
      .expect(302);

    expect(records()).toHaveLength(1);
    expect(records()[0]).toMatchObject({
      req: { method: 'GET', url: '/api/auth/oauth/google/callback' },
      res: { statusCode: 302 },
      msg: 'request completed',
    });
    for (const secret of [
      'provider-code-secret',
      'state-secret',
      'private-email@example.com',
      'private-subject',
      'unexpected-secret',
      'handoff-secret',
      'bearer-secret',
      'request-cookie-secret',
      'cookie-session-secret',
      'referer-secret',
    ]) {
      expect(output()).not.toContain(secret);
    }
  });

  it('never serializes Apple form fields or session-exchange verifiers', async () => {
    const { app, output, records } = createLoggedApp();
    app.post('/api/auth/oauth/apple/callback', (req, res) => {
      req.log.info({ req }, 'Apple callback received');
      res.redirect(
        'https://web.example/auth/oauth/callback#code=apple-handoff',
      );
    });
    app.post('/api/auth/oauth/session/exchange', (req, res) => {
      req.log.info({
        req,
        code: req.body.code,
        verifier: req.body.verifier,
        state: 'flow-state-secret',
        access_token: 'result-token-secret',
      });
      res.sendStatus(201);
    });

    await request(app)
      .post('/api/auth/oauth/apple/callback')
      .type('form')
      .send({
        code: 'apple-provider-code',
        state: 'apple-state-secret',
        user: JSON.stringify({ email: 'apple-private@example.com' }),
      })
      .expect(302);
    await request(app)
      .post('/api/auth/oauth/session/exchange')
      .send({
        code: 'exchange-code-secret',
        verifier: 'browser-verifier-secret',
      })
      .expect(201);

    expect(records()).toHaveLength(4);
    for (const secret of [
      'apple-provider-code',
      'apple-state-secret',
      'apple-private@example.com',
      'apple-handoff',
      'exchange-code-secret',
      'browser-verifier-secret',
      'flow-state-secret',
      'result-token-secret',
    ]) {
      expect(output()).not.toContain(secret);
    }
  });

  it('does not include unexpected OAuth errors or their causes in automatic request logs', async () => {
    const { app, output, records } = createLoggedApp();
    app.get('/api/auth/oauth/google/callback', (_req, res) => {
      res.err = new Error('Provider failed for code=error-code-secret', {
        cause: new Error('identity=error-identity-secret'),
      });
      res.sendStatus(500);
    });

    await request(app)
      .get('/api/auth/oauth/google/callback?code=query-code-secret')
      .expect(500);

    expect(records()[0]).toMatchObject({
      req: { url: '/api/auth/oauth/google/callback' },
      res: { statusCode: 500 },
      err: { message: 'OAuth request failed' },
    });
    expect(output()).not.toContain('error-code-secret');
    expect(output()).not.toContain('error-identity-secret');
    expect(output()).not.toContain('query-code-secret');
  });

  it('retains non-auth route diagnostics', async () => {
    const { app, records } = createLoggedApp();
    app.get('/api/symbols', (_req, res) => {
      res.err = new Error('Database connection refused');
      res.sendStatus(500);
    });

    await request(app).get('/api/symbols?q=AAPL').expect(500);

    expect(records()[0]).toMatchObject({
      req: { url: '/api/symbols?q=AAPL', query: { q: 'AAPL' } },
      err: { message: 'Database connection refused' },
    });
  });

  it('redacts OAuth failures inside a mounted Express router using the original URL', async () => {
    const { app, output, records } = createLoggedApp();
    const router = express.Router();
    router.get('/callback', (_req, res) => {
      res.err = new Error('Mounted callback code=mounted-secret');
      res.sendStatus(500);
    });
    app.use('/api/auth/oauth/google', router);

    await request(app)
      .get('/api/auth/oauth/google/callback?code=mounted-query-secret')
      .expect(500);

    expect(records()[0]).toMatchObject({
      req: { url: '/api/auth/oauth/google/callback' },
      err: { message: 'OAuth request failed' },
    });
    expect(output()).not.toContain('mounted-secret');
    expect(output()).not.toContain('mounted-query-secret');
  });

  it('redacts callback query secrets when Express matches a differently cased route', async () => {
    const { app, output, records } = createLoggedApp();
    app.get('/api/auth/oauth/google/callback', (_req, res) => {
      res.err = new Error('Provider code=case-error-secret');
      res.sendStatus(500);
    });

    await request(app)
      .get(
        '/API/AUTH/OAUTH/GOOGLE/CALLBACK?code=case-code-secret&state=case-state-secret',
      )
      .expect(500);

    expect(records()[0]).toMatchObject({
      req: { url: '/API/AUTH/OAUTH/GOOGLE/CALLBACK' },
      err: { message: 'OAuth request failed' },
    });
    expect(output()).not.toContain('case-code-secret');
    expect(output()).not.toContain('case-state-secret');
    expect(output()).not.toContain('case-error-secret');
  });
});
