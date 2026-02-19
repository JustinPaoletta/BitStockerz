import { createServer, Socket, type Server } from 'net';
import type { AppConfigService } from '../config/app-config.service';
import { HealthService } from './health.service';

function createConfigService(overrides?: {
  databaseUrl?: string;
  marketDataHealthUrl?: string;
  timeoutMs?: number;
}): AppConfigService {
  return {
    server: {
      port: 3000,
      nodeEnv: 'test',
    },
    logging: {
      level: 'info',
      nodeEnv: 'test',
      writeToFile: false,
      filePath: 'logs/api.log',
    },
    readiness: {
      timeoutMs: overrides?.timeoutMs ?? 200,
    },
    dependencies: {
      databaseUrl: overrides?.databaseUrl,
      marketDataHealthUrl: overrides?.marketDataHealthUrl,
    },
  } as unknown as AppConfigService;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('HealthService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch as any;
  });

  it('returns live ok payload', () => {
    const service = new HealthService(createConfigService());
    expect(service.live()).toEqual({ status: 'ok' });
  });

  it('returns ready when optional checks are not configured', async () => {
    const service = new HealthService(createConfigService());

    const result = await service.readiness();

    expect(result.ready).toBe(true);
    expect(result.status).toBe('ok');
    expect(result.checks.database.status).toBe('not_configured');
    expect(result.checks.marketData.status).toBe('not_configured');
  });

  it('returns degraded when database URL is invalid', async () => {
    const service = new HealthService(createConfigService({
      databaseUrl: 'not-a-url',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.checks.database).toEqual({
      status: 'down',
      details: 'DATABASE_URL is invalid',
    });
  });

  it('returns degraded when database URL has no hostname', async () => {
    const service = new HealthService(createConfigService({
      databaseUrl: 'postgres:///bitstockerz',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({
      status: 'down',
      details: 'DATABASE_URL must include a hostname',
    });
  });

  it('returns degraded when database protocol is unsupported and no port is provided', async () => {
    const service = new HealthService(createConfigService({
      databaseUrl: 'oracle://localhost/bitstockerz',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(false);
    expect(result.checks.database).toEqual({
      status: 'down',
      details: 'DATABASE_URL must include a supported port or protocol',
    });
  });

  it('resolveDatabasePort handles explicit, invalid, and protocol-default ports', () => {
    const service = new HealthService(createConfigService());
    const resolveDatabasePort = (service as any).resolveDatabasePort.bind(service);

    expect(resolveDatabasePort('postgres', '7010')).toBe(7010);
    expect(resolveDatabasePort('postgres', 'abc')).toBeUndefined();
    expect(resolveDatabasePort('postgres', '')).toBe(5432);
    expect(resolveDatabasePort('unknown', '')).toBeUndefined();
  });

  it('returns up when database TCP endpoint is reachable', async () => {
    const server = createServer((socket) => {
      socket.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      await closeServer(server);
      throw new Error('Expected TCP server address object');
    }

    const service = new HealthService(createConfigService({
      databaseUrl: `postgres://127.0.0.1:${address.port}/bitstockerz`,
      timeoutMs: 300,
    }));

    try {
      const result = await service.readiness();
      expect(result.ready).toBe(true);
      expect(result.status).toBe('ok');
      expect(result.checks.database.status).toBe('up');
      expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    } finally {
      await closeServer(server);
    }
  });

  it('returns timeout details for TCP dependencies and ignores late follow-up errors', async () => {
    const service = new HealthService(createConfigService({ timeoutMs: 50 }));

    jest.spyOn(Socket.prototype, 'connect').mockImplementation(function mockConnect(this: Socket) {
      setImmediate(() => {
        this.emit('timeout');
        this.emit('error', 'late-error');
      });
      return this;
    } as any);

    const result = await (service as any).checkTcpDependency('127.0.0.1', 9999);

    expect(result.status).toBe('down');
    expect(result.details).toBe('Connection timed out after 50ms');
  });

  it('uses stringified values for non-Error TCP failures', async () => {
    const service = new HealthService(createConfigService({ timeoutMs: 50 }));

    jest.spyOn(Socket.prototype, 'connect').mockImplementation(function mockConnect(this: Socket) {
      setImmediate(() => {
        this.emit('error', 'socket-failed');
      });
      return this;
    } as any);

    const result = await (service as any).checkTcpDependency('127.0.0.1', 9999);

    expect(result.status).toBe('down');
    expect(result.details).toBe('socket-failed');
  });

  it('returns market data up when health endpoint responds with 2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
    }) as any;

    const service = new HealthService(createConfigService({
      marketDataHealthUrl: 'https://market-data.example.com/health',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(true);
    expect(result.checks.marketData.status).toBe('up');
    expect(result.checks.marketData.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns market data down when health endpoint is non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    }) as any;

    const service = new HealthService(createConfigService({
      marketDataHealthUrl: 'https://market-data.example.com/health',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.checks.marketData.status).toBe('down');
    expect(result.checks.marketData.details).toBe('Health endpoint returned HTTP 503');
  });

  it('returns market data timeout details when fetch aborts', async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (!signal) {
          reject(new Error('missing abort signal'));
          return;
        }

        signal.addEventListener('abort', () => {
          const abortError = new Error('aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    }) as any;

    const service = new HealthService(createConfigService({
      marketDataHealthUrl: 'https://market-data.example.com/health',
      timeoutMs: 50,
    }));

    const readinessPromise = service.readiness();
    jest.advanceTimersByTime(50);
    const result = await readinessPromise;

    expect(result.ready).toBe(false);
    expect(result.checks.marketData.status).toBe('down');
    expect(result.checks.marketData.details).toBe('Request timed out after 50ms');
  });

  it('uses stringified values for non-Error market data failures', async () => {
    global.fetch = jest.fn().mockRejectedValue('market-down') as any;

    const service = new HealthService(createConfigService({
      marketDataHealthUrl: 'https://market-data.example.com/health',
    }));

    const result = await service.readiness();

    expect(result.ready).toBe(false);
    expect(result.checks.marketData.status).toBe('down');
    expect(result.checks.marketData.details).toBe('market-down');
  });
});
