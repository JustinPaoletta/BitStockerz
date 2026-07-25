import type { AppConfigService } from '../config/app-config.service';
import { MetricsService } from './metrics.service';

function createConfig(enabled = true): AppConfigService {
  return {
    metrics: { enabled },
  } as AppConfigService;
}

describe('MetricsService', () => {
  it('records http and job metrics into a snapshot', () => {
    const service = new MetricsService(createConfig());
    service.recordHttp(10, false);
    service.recordHttp(40, true);
    service.recordJob('equity_daily_import', 'completed', 80);
    service.recordJob('equity_daily_import', 'failed', 12);
    service.recordJob('crypto_import', 'timed_out', 50);
    service.recordError('market_data');
    service.recordError('jobs');
    service.recordError('unknown');

    const snapshot = service.snapshot(new Date('2026-07-24T00:00:00.000Z'));
    expect(snapshot.timestamp).toBe('2026-07-24T00:00:00.000Z');
    expect(snapshot.http.request_count).toBe(2);
    expect(snapshot.http.error_count).toBe(1);
    expect(snapshot.http.duration_ms.max).toBe(40);
    expect(snapshot.jobs.by_type.equity_daily_import.completed).toBe(1);
    expect(snapshot.jobs.by_type.equity_daily_import.failed).toBe(1);
    expect(snapshot.jobs.by_type.crypto_import.timed_out).toBe(1);
    expect(snapshot.errors_by_domain.market_data).toBe(1);
    expect(snapshot.errors_by_domain.jobs).toBe(1);
    expect(snapshot.errors_by_domain.unknown).toBe(1);
  });

  it('no-ops when metrics are disabled', () => {
    const service = new MetricsService(createConfig(false));
    service.recordHttp(5, true);
    service.recordJob('crypto_import', 'failed', 12);
    service.recordError('auth');

    const snapshot = service.snapshot();
    expect(snapshot.http.request_count).toBe(0);
    expect(snapshot.jobs.by_type).toEqual({});
    expect(snapshot.errors_by_domain.auth).toBe(0);
  });

  it('resets state for tests', () => {
    const service = new MetricsService(createConfig());
    service.recordHttp(1, false);
    service.resetForTests();
    expect(service.snapshot().http.request_count).toBe(0);
  });

  it('bounds http duration samples to the ring-buffer capacity', () => {
    const service = new MetricsService(createConfig());
    for (let index = 0; index < 520; index += 1) {
      service.recordHttp(index, false);
    }

    const snapshot = service.snapshot();
    expect(snapshot.http.duration_ms.count).toBe(500);
    expect(snapshot.http.duration_ms.max).toBe(519);
  });
});
