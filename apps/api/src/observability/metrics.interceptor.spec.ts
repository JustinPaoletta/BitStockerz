import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { METRICS_HTTP_RECORDED } from './metrics-domain';
import { MetricsInterceptor } from './metrics.interceptor';
import type { MetricsService } from './metrics.service';

describe('MetricsInterceptor', () => {
  it('records http metrics for successful requests', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
      recordError: jest.fn(),
    } as unknown as MetricsService;

    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/market-data/health' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ ok: true }),
      } as CallHandler),
    );

    expect(metrics.recordHttp).toHaveBeenCalled();
    expect(metrics.recordError).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/auth/login', 'auth'],
    ['/api/jobs/abc', 'jobs'],
    ['/api', 'unknown'],
  ])(
    'records domain errors for %s as %s when status is already set',
    async (path, domain) => {
      const metrics = {
        enabled: true,
        recordHttp: jest.fn(),
        recordError: jest.fn(),
      } as unknown as MetricsService;

      const interceptor = new MetricsInterceptor(metrics);
      const context = {
        getType: () => 'http',
        switchToHttp: () => ({
          getRequest: () => ({ path }),
          getResponse: () => ({ statusCode: 401 }),
        }),
      } as unknown as ExecutionContext;

      await lastValueFrom(
        interceptor.intercept(context, {
          handle: () => of(null),
        } as CallHandler),
      );

      expect(metrics.recordError).toHaveBeenCalledWith(domain);
    },
  );

  it('does not record on thrown errors (exception filter owns that path)', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
      recordError: jest.fn(),
    } as unknown as MetricsService;

    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ path: '/api/market-data/health' }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('boom')),
        } as CallHandler),
      ),
    ).rejects.toThrow('boom');

    expect(metrics.recordHttp).not.toHaveBeenCalled();
    expect(metrics.recordError).not.toHaveBeenCalled();
  });

  it('skips when metrics were already recorded', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
      recordError: jest.fn(),
    } as unknown as MetricsService;

    const interceptor = new MetricsInterceptor(metrics);
    const request = {
      path: '/api/market-data/health',
      [METRICS_HTTP_RECORDED]: true,
    };
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ ok: true }),
      } as CallHandler),
    );

    expect(metrics.recordHttp).not.toHaveBeenCalled();
  });

  it('skips when metrics are disabled', async () => {
    const metrics = {
      enabled: false,
      recordHttp: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'http',
    } as ExecutionContext;

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => of('ok'),
        } as CallHandler),
      ),
    ).resolves.toBe('ok');
    expect(metrics.recordHttp).not.toHaveBeenCalled();
  });

  it('falls back to request url and treats missing status as success', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
      recordError: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/me' }),
        getResponse: () => ({}),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(null),
      } as CallHandler),
    );

    expect(metrics.recordHttp).toHaveBeenCalledWith(expect.any(Number), false);
    expect(metrics.recordError).not.toHaveBeenCalled();
  });

  it('falls back to empty path when request path and url are missing', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
      recordError: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ statusCode: 500 }),
      }),
    } as unknown as ExecutionContext;

    await lastValueFrom(
      interceptor.intercept(context, {
        handle: () => of(null),
      } as CallHandler),
    );

    expect(metrics.recordError).toHaveBeenCalledWith('unknown');
  });

  it('passes through non-http contexts', async () => {
    const metrics = {
      enabled: true,
      recordHttp: jest.fn(),
    } as unknown as MetricsService;
    const interceptor = new MetricsInterceptor(metrics);
    const context = {
      getType: () => 'rpc',
    } as ExecutionContext;

    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => of('rpc-ok'),
        } as CallHandler),
      ),
    ).resolves.toBe('rpc-ok');
    expect(metrics.recordHttp).not.toHaveBeenCalled();
  });
});
