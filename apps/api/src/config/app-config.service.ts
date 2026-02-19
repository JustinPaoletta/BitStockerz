import { Injectable } from '@nestjs/common';

export type NodeEnvironment = 'development' | 'test' | 'production';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const NODE_ENVIRONMENTS = new Set<NodeEnvironment>(['development', 'test', 'production']);
const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);

const DEFAULT_PORT = 3000;
const DEFAULT_LOG_LEVEL = 'info';
const DEFAULT_LOG_FILE_PATH = 'logs/api.log';
const DEFAULT_READINESS_TIMEOUT_MS = 1500;

export interface ServerConfig {
  port: number;
  nodeEnv: NodeEnvironment;
}

export interface LoggingConfig {
  level: string;
  nodeEnv: NodeEnvironment;
  writeToFile: boolean;
  filePath: string;
}

export interface ReadinessConfig {
  timeoutMs: number;
}

export interface DependencyConfig {
  databaseUrl?: string;
  marketDataHealthUrl?: string;
}

export interface AppConfig {
  server: ServerConfig;
  logging: LoggingConfig;
  readiness: ReadinessConfig;
  dependencies: DependencyConfig;
}

function normalizeOptional(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseBoolean(
  envName: string,
  rawValue: string | undefined,
  defaultValue: boolean,
  errors: string[],
): boolean {
  const normalized = normalizeOptional(rawValue);
  if (normalized === undefined) {
    return defaultValue;
  }

  const lowered = normalized.toLowerCase();
  if (TRUE_VALUES.has(lowered)) {
    return true;
  }

  if (FALSE_VALUES.has(lowered)) {
    return false;
  }

  errors.push(`${envName} must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}`);
  return defaultValue;
}

function parseInteger(
  envName: string,
  rawValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const normalized = normalizeOptional(rawValue);
  if (normalized === undefined) {
    return defaultValue;
  }

  if (!/^\d+$/.test(normalized)) {
    errors.push(`${envName} must be an integer`);
    return defaultValue;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (parsed < min || parsed > max) {
    errors.push(`${envName} must be between ${min} and ${max}`);
    return defaultValue;
  }

  return parsed;
}

function parseNodeEnvironment(rawValue: string | undefined, errors: string[]): NodeEnvironment {
  const normalized = normalizeOptional(rawValue)?.toLowerCase() as NodeEnvironment | undefined;
  if (normalized === undefined) {
    return 'development';
  }

  if (!NODE_ENVIRONMENTS.has(normalized)) {
    errors.push(`NODE_ENV must be one of ${[...NODE_ENVIRONMENTS].join(', ')}`);
    return 'development';
  }

  return normalized;
}

function parseLogLevel(rawValue: string | undefined, errors: string[]): string {
  const normalized = normalizeOptional(rawValue)?.toLowerCase();
  if (normalized === undefined) {
    return DEFAULT_LOG_LEVEL;
  }

  if (!LOG_LEVELS.has(normalized)) {
    errors.push(`LOG_LEVEL must be one of ${[...LOG_LEVELS].join(', ')}`);
    return DEFAULT_LOG_LEVEL;
  }

  return normalized;
}

function parseOptionalDatabaseUrl(rawValue: string | undefined, errors: string[]): string | undefined {
  const normalized = normalizeOptional(rawValue);
  if (!normalized) {
    return undefined;
  }

  try {
    // Validate that configured DB URL is URL-shaped (e.g. postgres://, mysql://, file://).
    new URL(normalized);
    return normalized;
  } catch {
    errors.push('DATABASE_URL must be a valid URL');
    return undefined;
  }
}

function parseOptionalHttpUrl(
  envName: string,
  rawValue: string | undefined,
  errors: string[],
): string | undefined {
  const normalized = normalizeOptional(rawValue);
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push(`${envName} must use http or https`);
      return undefined;
    }

    if (!url.hostname) {
      errors.push(`${envName} must include a hostname`);
      return undefined;
    }

    return normalized;
  } catch {
    errors.push(`${envName} must be a valid URL`);
    return undefined;
  }
}

export function loadAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const errors: string[] = [];

  const nodeEnv = parseNodeEnvironment(env.NODE_ENV, errors);
  const port = parseInteger('PORT', env.PORT, DEFAULT_PORT, 1, 65535, errors);
  const logLevel = parseLogLevel(env.LOG_LEVEL, errors);
  const logFilePath = normalizeOptional(env.LOG_FILE_PATH);
  const logToFile = parseBoolean('LOG_TO_FILE', env.LOG_TO_FILE, false, errors) || Boolean(logFilePath);

  const readinessTimeoutMs = parseInteger(
    'READINESS_TIMEOUT_MS',
    env.READINESS_TIMEOUT_MS,
    DEFAULT_READINESS_TIMEOUT_MS,
    100,
    30000,
    errors,
  );

  const databaseUrl = parseOptionalDatabaseUrl(env.DATABASE_URL, errors);
  const marketDataHealthUrl = parseOptionalHttpUrl('MARKET_DATA_HEALTH_URL', env.MARKET_DATA_HEALTH_URL, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    server: {
      port,
      nodeEnv,
    },
    logging: {
      level: logLevel,
      nodeEnv,
      writeToFile: logToFile,
      filePath: logFilePath ?? DEFAULT_LOG_FILE_PATH,
    },
    readiness: {
      timeoutMs: readinessTimeoutMs,
    },
    dependencies: {
      databaseUrl,
      marketDataHealthUrl,
    },
  };
}

@Injectable()
export class AppConfigService {
  private readonly config: AppConfig;

  constructor() {
    this.config = loadAppConfig(process.env);
  }

  get server(): ServerConfig {
    return this.config.server;
  }

  get logging(): LoggingConfig {
    return this.config.logging;
  }

  get readiness(): ReadinessConfig {
    return this.config.readiness;
  }

  get dependencies(): DependencyConfig {
    return this.config.dependencies;
  }
}
