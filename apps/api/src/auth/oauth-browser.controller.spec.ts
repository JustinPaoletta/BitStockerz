import { Test } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'node:http';
import type { Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  AuthGuard,
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from './auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuditService } from '../observability/audit.service';

const auth = {
  access_token: 'session',
  token_type: 'Bearer' as const,
  user: { id: 'u1', email: 'user@example.com' },
};
function setup() {
  const service = {
    getOAuthProviders: jest.fn(() => ({ google: true, apple: false })),
    createOAuthBrowserStart: jest.fn().mockResolvedValue({
      provider: 'google',
      state: 'state',
      authorization_url: 'https://google.test',
      expires_in_seconds: 300,
    }),
    exchangeOAuthSession: jest
      .fn()
      .mockResolvedValue({ ...auth, return_path: '/account', intent: 'link' }),
    handleOAuthCallback: jest.fn().mockResolvedValue({
      redirect_url:
        'https://web.test/auth/oauth/callback#code=one-use&state=state',
    }),
    ensurePaperAccountForUser: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    service,
    audit,
    controller: new AuthController(
      service as unknown as AuthService,
      audit as unknown as AuditService,
    ),
  };
}
function response() {
  return { setHeader: jest.fn(), redirect: jest.fn() } as unknown as Response;
}
function req(token?: string): AuthenticatedRequest {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    [AUTH_TOKEN_REQUEST_KEY]: token,
  } as AuthenticatedRequest;
}

describe('Browser OAuth controller', () => {
  it('returns public availability, validates provider, and binds link starts to auth token', async () => {
    const { service, controller } = setup();
    const body = { code_challenge: 'x'.repeat(43), return_path: '/account' };
    expect(controller.providers()).toEqual({ google: true, apple: false });
    await controller.oauthBrowserStart('google', body);
    await controller.oauthLinkStart('apple', body, req('original'));
    expect(service.createOAuthBrowserStart).toHaveBeenCalledWith(
      'apple',
      body,
      'original',
    );
    expect(() => controller.oauthBrowserStart('evil', body)).toThrow(
      'Unsupported',
    );
    expect(() => controller.oauthLinkStart('google', body, req())).toThrow();
  });
  it('exchanges anonymous login or original authenticated link and audits only safe metadata', async () => {
    const { controller, service, audit } = setup();
    await controller.oauthSessionExchange(
      { code: 'code', verifier: 'verifier' },
      req('original'),
    );
    expect(service.exchangeOAuthSession).toHaveBeenCalledWith(
      { code: 'code', verifier: 'verifier' },
      'original',
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'auth.provider_linked' }),
    );
    service.exchangeOAuthSession.mockResolvedValue({
      ...auth,
      return_path: '/account',
      intent: 'login',
    });
    await controller.oauthSessionExchange(
      { code: 'code', verifier: 'verifier' },
      req(),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'auth.login' }),
    );
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('verifier');
  });
  it.each(['google', 'appleGet', 'applePost'])(
    'redirects persisted browser flows without sending bearer response for %s',
    async (route) => {
      const { controller, service } = setup();
      const res = response();
      const dto = {
        state: 'state',
        code: 'provider-code',
        error_description: 'untrusted',
      };
      if (route === 'google') await controller.oauthGoogleCallback(dto, res);
      else if (route === 'appleGet')
        await controller.oauthAppleCallbackGet(dto, res);
      else await controller.oauthAppleCallbackPost(dto, res);
      expect(res.redirect).toHaveBeenCalledWith(
        303,
        'https://web.test/auth/oauth/callback#code=one-use&state=state',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(service.ensurePaperAccountForUser).not.toHaveBeenCalled();
    },
  );
  it('retains JSON callback compatibility for stored JSON flow state', async () => {
    const { controller, service } = setup();
    service.handleOAuthCallback.mockResolvedValue(auth);
    const result = await controller.oauthGoogleCallback(
      { state: 'state', code: 'code' },
      response(),
    );
    expect(result).toEqual(auth);
    expect(service.ensurePaperAccountForUser).toHaveBeenCalledWith('u1');
  });
});

describe('Browser OAuth HTTP validation', () => {
  let app: INestApplication;
  const { service, audit } = setup();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: AuditService, useValue: audit },
      ],
    })
      .overrideGuard(AuthRateLimitGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => app.close());
  it('accepts Google documented scope callback metadata', async () => {
    await request(app.getHttpServer() as Server)
      .get('/auth/oauth/google/callback')
      .query({
        state: 'state',
        code: 'code',
        scope: 'openid email profile',
        authuser: '0',
        prompt: 'none',
      })
      .expect(303);
  });
  it('accepts provider cancellation metadata without requiring code or Apple sub', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/oauth/apple/callback')
      .type('form')
      .send({
        state: 'state',
        error: 'access_denied',
        error_description: 'user cancelled',
        error_uri: 'https://provider.test',
      })
      .expect(303);
  });
  it('rejects invalid verifier challenges before provider start', async () => {
    await request(app.getHttpServer() as Server)
      .post('/auth/oauth/google/browser/start')
      .send({ code_challenge: 'bad', return_path: '/dashboard' })
      .expect(400);
  });
});
