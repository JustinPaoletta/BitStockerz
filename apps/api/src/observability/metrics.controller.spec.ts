import { MetricsController } from './metrics.controller';
import type { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  it('returns the metrics snapshot', () => {
    const snapshot = {
      timestamp: '2026-07-24T00:00:00.000Z',
      http: {
        request_count: 1,
        error_count: 0,
        duration_ms: { count: 1, avg: 1, p95: 1, max: 1 },
      },
      jobs: { by_type: {} },
      errors_by_domain: {
        auth: 0,
        market_data: 0,
        jobs: 0,
        unknown: 0,
      },
    };
    const metrics = {
      snapshot: jest.fn().mockReturnValue(snapshot),
    } as unknown as MetricsService;

    const controller = new MetricsController(metrics);
    expect(controller.getMetrics()).toEqual(snapshot);
  });
});
