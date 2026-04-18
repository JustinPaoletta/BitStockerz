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
const DEFAULT_AUTH_SESSION_TTL_SECONDS = 43200;
const DEFAULT_AUTH_CHALLENGE_TTL_SECONDS = 300;
const DEFAULT_AUTH_OAUTH_STATE_TTL_SECONDS = 300;
const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS = 30;
const DEFAULT_WEBAUTHN_RP_ID = 'localhost';
const DEFAULT_WEBAUTHN_RP_NAME = 'BitStockerz';

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

export interface AuthConfig {
  sessionTtlSeconds: number;
  challengeTtlSeconds: number;
  oauthStateTtlSeconds: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  webauthnRpId: string;
  webauthnRpName: string;
  webauthnAllowedOrigins: string[];
  googleClientId?: string;
  googleClientSecret?: string;
  googleRedirectUri?: string;
  appleClientId?: string;
  appleTeamId?: string;
  appleKeyId?: string;
  applePrivateKey?: string;
  appleRedirectUri?: string;
}

export interface AppConfig {
  server: ServerConfig;
  logging: LoggingConfig;
  readiness: ReadinessConfig;
  dependencies: DependencyConfig;
  auth: AuthConfig;
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

function parseOptionalUrl(envName: string, rawValue: string | undefined, errors: string[]): string | undefined {
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
    return normalized;
  } catch {
    errors.push(`${envName} must be a valid URL`);
    return undefined;
  }
}

function parseCsvUrls(envName: string, rawValue: string | undefined, errors: string[]): string[] {
  const normalized = normalizeOptional(rawValue);
  if (!normalized) {
    return [];
  }

  const values = normalized
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values
    .map((value) => {
      try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(`${envName} values must use http or https`);
          return undefined;
        }
        return value;
      } catch {
        errors.push(`${envName} contains an invalid URL: ${value}`);
        return undefined;
      }
    })
    .filter((value): value is string => Boolean(value));
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
  const sessionTtlSeconds = parseInteger(
    'AUTH_SESSION_TTL_SECONDS',
    env.AUTH_SESSION_TTL_SECONDS,
    DEFAULT_AUTH_SESSION_TTL_SECONDS,
    1,
    604800,
    errors,
  );
  const challengeTtlSeconds = parseInteger(
    'AUTH_CHALLENGE_TTL_SECONDS',
    env.AUTH_CHALLENGE_TTL_SECONDS,
    DEFAULT_AUTH_CHALLENGE_TTL_SECONDS,
    30,
    900,
    errors,
  );
  const oauthStateTtlSeconds = parseInteger(
    'AUTH_OAUTH_STATE_TTL_SECONDS',
    env.AUTH_OAUTH_STATE_TTL_SECONDS,
    DEFAULT_AUTH_OAUTH_STATE_TTL_SECONDS,
    30,
    900,
    errors,
  );
  const rateLimitWindowMs = parseInteger(
    'AUTH_RATE_LIMIT_WINDOW_MS',
    env.AUTH_RATE_LIMIT_WINDOW_MS,
    DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS,
    1000,
    300000,
    errors,
  );
  const rateLimitMaxRequests = parseInteger(
    'AUTH_RATE_LIMIT_MAX_REQUESTS',
    env.AUTH_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_AUTH_RATE_LIMIT_MAX_REQUESTS,
    1,
    1000,
    errors,
  );
  const webauthnRpId = normalizeOptional(env.WEBAUTHN_RP_ID) ?? DEFAULT_WEBAUTHN_RP_ID;
  const webauthnRpName = normalizeOptional(env.WEBAUTHN_RP_NAME) ?? DEFAULT_WEBAUTHN_RP_NAME;
  const webauthnAllowedOrigins = parseCsvUrls(
    'WEBAUTHN_ALLOWED_ORIGINS',
    env.WEBAUTHN_ALLOWED_ORIGINS,
    errors,
  );
  const googleClientId = normalizeOptional(env.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = normalizeOptional(env.GOOGLE_OAUTH_CLIENT_SECRET);
  const googleRedirectUri = parseOptionalUrl('GOOGLE_OAUTH_REDIRECT_URI', env.GOOGLE_OAUTH_REDIRECT_URI, errors);
  const appleClientId = normalizeOptional(env.APPLE_OAUTH_CLIENT_ID);
  const appleTeamId = normalizeOptional(env.APPLE_OAUTH_TEAM_ID);
  const appleKeyId = normalizeOptional(env.APPLE_OAUTH_KEY_ID);
  const applePrivateKey = normalizeOptional(env.APPLE_OAUTH_PRIVATE_KEY);
  const appleRedirectUri = parseOptionalUrl('APPLE_OAUTH_REDIRECT_URI', env.APPLE_OAUTH_REDIRECT_URI, errors);

  if (webauthnRpId.length === 0) {
    errors.push('WEBAUTHN_RP_ID must not be empty');
  }

  if (webauthnRpName.length === 0) {
    errors.push('WEBAUTHN_RP_NAME must not be empty');
  }

  if (googleClientId && (!googleClientSecret || !googleRedirectUri)) {
    errors.push(
      'GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI are required when GOOGLE_OAUTH_CLIENT_ID is set',
    );
  }

  if ((googleClientSecret || googleRedirectUri) && !googleClientId) {
    errors.push('GOOGLE_OAUTH_CLIENT_ID is required when Google OAuth settings are provided');
  }

  const appleValues = [appleClientId, appleTeamId, appleKeyId, applePrivateKey, appleRedirectUri];
  const anyAppleValue = appleValues.some((value) => value !== undefined);
  const allAppleValues = appleValues.every((value) => value !== undefined);

  if (anyAppleValue && !allAppleValues) {
    errors.push(
      'APPLE_OAUTH_CLIENT_ID, APPLE_OAUTH_TEAM_ID, APPLE_OAUTH_KEY_ID, APPLE_OAUTH_PRIVATE_KEY, and APPLE_OAUTH_REDIRECT_URI must all be set together',
    );
  }

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
    auth: {
      sessionTtlSeconds,
      challengeTtlSeconds,
      oauthStateTtlSeconds,
      rateLimitWindowMs,
      rateLimitMaxRequests,
      webauthnRpId,
      webauthnRpName,
      webauthnAllowedOrigins,
      googleClientId,
      googleClientSecret,
      googleRedirectUri,
      appleClientId,
      appleTeamId,
      appleKeyId,
      applePrivateKey,
      appleRedirectUri,
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

  get auth(): AuthConfig {
    return this.config.auth;
  }
}
