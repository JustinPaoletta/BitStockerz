import { Injectable } from '@nestjs/common';
import { Socket } from 'net';
import { AppConfigService } from '../config/app-config.service';

type DependencyStatus = 'up' | 'down' | 'not_configured';

export interface DependencyCheck {
  status: DependencyStatus;
  latencyMs?: number;
  details?: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  ready: boolean;
  timestamp: string;
  checks: {
    database: DependencyCheck;
    marketData: DependencyCheck;
  };
}

const DATABASE_PROTOCOL_PORTS: Record<string, number> = {
  postgres: 5432,
  postgresql: 5432,
  mysql: 3306,
  mariadb: 3306,
  mssql: 1433,
  mongodb: 27017,
  redis: 6379,
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return String(error);
}

@Injectable()
export class HealthService {
  constructor(private readonly config: AppConfigService) {}

  live() {
    return { status: 'ok' };
  }

  async readiness(): Promise<ReadinessResponse> {
    const [database, marketData] = await Promise.all([this.checkDatabase(), this.checkMarketData()]);
    const ready = database.status !== 'down' && marketData.status !== 'down';

    return {
      status: ready ? 'ok' : 'degraded',
      ready,
      timestamp: new Date().toISOString(),
      checks: {
        database,
        marketData,
      },
    };
  }

  private async checkDatabase(): Promise<DependencyCheck> {
    const databaseUrl = this.config.dependencies.databaseUrl;
    if (!databaseUrl) {
      return { status: 'not_configured', details: 'DATABASE_URL is not configured' };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(databaseUrl);
    } catch {
      return { status: 'down', details: 'DATABASE_URL is invalid' };
    }

    const host = parsedUrl.hostname;
    if (!host) {
      return { status: 'down', details: 'DATABASE_URL must include a hostname' };
    }

    const protocol = parsedUrl.protocol.replace(':', '').toLowerCase();
    const port = this.resolveDatabasePort(protocol, parsedUrl.port);
    if (!port) {
      return {
        status: 'down',
        details: 'DATABASE_URL must include a supported port or protocol',
      };
    }

    return this.checkTcpDependency(host, port);
  }

  private resolveDatabasePort(protocol: string, rawPort: string): number | undefined {
    if (rawPort) {
      const parsed = Number.parseInt(rawPort, 10);
      if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 65535) {
        return parsed;
      }
      return undefined;
    }

    return DATABASE_PROTOCOL_PORTS[protocol];
  }

  private async checkTcpDependency(host: string, port: number): Promise<DependencyCheck> {
    const timeoutMs = this.config.readiness.timeoutMs;
    const startTime = Date.now();

    return new Promise<DependencyCheck>((resolve) => {
      const socket = new Socket();
      let settled = false;

      const done = (check: DependencyCheck) => {
        if (settled) {
          return;
        }

        settled = true;
        socket.destroy();
        resolve(check);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        done({ status: 'up', latencyMs: Date.now() - startTime });
      });
      socket.once('timeout', () => {
        done({
          status: 'down',
          latencyMs: Date.now() - startTime,
          details: `Connection timed out after ${timeoutMs}ms`,
        });
      });
      socket.once('error', (error) => {
        done({
          status: 'down',
          latencyMs: Date.now() - startTime,
          details: toErrorMessage(error),
        });
      });

      socket.connect(port, host);
    });
  }

  private async checkMarketData(): Promise<DependencyCheck> {
    const marketDataHealthUrl = this.config.dependencies.marketDataHealthUrl;
    if (!marketDataHealthUrl) {
      return { status: 'not_configured', details: 'MARKET_DATA_HEALTH_URL is not configured' };
    }

    const timeoutMs = this.config.readiness.timeoutMs;
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(marketDataHealthUrl, {
        method: 'GET',
        signal: abortController.signal,
      });

      const latencyMs = Date.now() - startTime;
      if (!response.ok) {
        return {
          status: 'down',
          latencyMs,
          details: `Health endpoint returned HTTP ${response.status}`,
        };
      }

      return {
        status: 'up',
        latencyMs,
      };
    } catch (error) {
      const detail = error instanceof Error && error.name === 'AbortError'
        ? `Request timed out after ${timeoutMs}ms`
        : toErrorMessage(error);

      return {
        status: 'down',
        latencyMs: Date.now() - startTime,
        details: detail,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
