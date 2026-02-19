import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

describe('HealthController', () => {
  it('returns ok status from live endpoint', () => {
    const healthService = {
      live: jest.fn(() => ({ status: 'ok' })),
      readiness: jest.fn(),
    } as unknown as HealthService;

    const controller = new HealthController(healthService);
    expect(controller.live()).toEqual({ status: 'ok' });
    expect(healthService.live).toHaveBeenCalledTimes(1);
  });

  it('returns 503 for ready endpoint when checks are not ready', async () => {
    const healthService = {
      live: jest.fn(),
      readiness: jest.fn(async () => ({
        status: 'degraded',
        ready: false,
        timestamp: '2026-02-19T00:00:00.000Z',
        checks: {
          database: { status: 'down', details: 'connection refused' },
          marketData: { status: 'not_configured', details: 'MARKET_DATA_HEALTH_URL is not configured' },
        },
      })),
    } as unknown as HealthService;

    const response = { status: jest.fn() };
    const controller = new HealthController(healthService);
    const payload = await controller.ready(response as any);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(payload.ready).toBe(false);
    expect(payload.status).toBe('degraded');
  });

  it('does not set 503 for ready endpoint when checks are healthy', async () => {
    const healthService = {
      live: jest.fn(),
      readiness: jest.fn(async () => ({
        status: 'ok',
        ready: true,
        timestamp: '2026-02-19T00:00:00.000Z',
        checks: {
          database: { status: 'up', latencyMs: 2 },
          marketData: { status: 'up', latencyMs: 3 },
        },
      })),
    } as unknown as HealthService;

    const response = { status: jest.fn() };
    const controller = new HealthController(healthService);
    const payload = await controller.ready(response as any);

    expect(response.status).not.toHaveBeenCalled();
    expect(payload.ready).toBe(true);
    expect(payload.status).toBe('ok');
  });
});
