import { Injectable } from '@nestjs/common';

export type NodeEnvironment = 'development' | 'test' | 'production';

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);
const NODE_ENVIRONMENTS = new Set<NodeEnvironment>([
  'development',
  'test',
  'production',
]);
const LOG_LEVELS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
]);

const DEFAULT_PORT = 4000;
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
const DEFAULT_JOB_TIMEOUT_MS = 30000;
const DEFAULT_JOBS_SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_STALE_EQUITY_DAILY_MS = 172_800_000; // 48h
const DEFAULT_STALE_CRYPTO_DAILY_MS = 129_600_000; // 36h
const DEFAULT_STALE_CRYPTO_HOURLY_MS = 7_200_000; // 2h
const DEFAULT_BACKTEST_TIMEOUT_MS = 5_000;
const DEFAULT_BACKTEST_MAX_BARS = 10_000;
const DEFAULT_BACKTEST_MAX_SERIES_CELLS = 250_000;
const DEFAULT_BACKTEST_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_BACKTEST_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_PAPER_STARTING_BALANCE = '100000.00';
const DEFAULT_TRADING_MAX_ORDER_NOTIONAL = '25000';
const DEFAULT_TRADING_MAX_POSITION_PCT = '25';
const DEFAULT_TRADING_MIN_CASH_REMAINING = '0';
const DEFAULT_AI_DAILY_CALL_LIMIT = 20;
const DEFAULT_AI_TIMEOUT_MS = 15_000;
const DEFAULT_AI_MAX_RETRIES = 1;
const DEFAULT_AI_MAX_OUTPUT_TOKENS = 1200;
const DEFAULT_AI_MAX_CONTEXT_CHARS = 12_000;
const DEFAULT_AI_MODEL = 'gpt-4.1-mini';
const DEFAULT_CACHE_CANDLES_TTL_MS = 60_000;
const DEFAULT_CACHE_SYMBOLS_TTL_MS = 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 500;
const DEFAULT_CIRCUIT_FAILURES = 3;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 60_000;
const AI_PROVIDERS = new Set<AiProviderName>(['stub', 'openai']);

export interface ServerConfig {
  port: number;
  nodeEnv: NodeEnvironment;
  corsAllowedOrigins: string[];
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

export interface JobsConfig {
  timeoutMs: number;
  schedulerEnabled: boolean;
  systemUserId: string;
}

export interface MarketDataConfig {
  staleEquityDailyMs: number;
  staleCryptoDailyMs: number;
  staleCryptoHourlyMs: number;
  liveEnabled: boolean;
  circuitFailures: number;
  circuitCooldownMs: number;
}

export interface CacheConfig {
  enabled: boolean;
  candlesTtlMs: number;
  symbolsTtlMs: number;
  maxEntries: number;
}

export interface MetricsConfig {
  enabled: boolean;
}

export interface BacktestConfig {
  timeoutMs: number;
  maxBars: number;
  maxSeriesCells: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface TradingConfig {
  paperStartingBalance: string;
  maxOrderNotional: string;
  maxPositionPct: string;
  minCashRemaining: string;
}

export type AiProviderName = 'stub' | 'openai';

export interface AiConfig {
  enabled: boolean;
  provider: AiProviderName;
  model: string;
  dailyCallLimit: number;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens: number;
  maxContextChars: number;
  logContent: boolean;
  openaiApiKey?: string;
  diffSuggestionsEnabled: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  logging: LoggingConfig;
  readiness: ReadinessConfig;
  dependencies: DependencyConfig;
  auth: AuthConfig;
  jobs: JobsConfig;
  marketData: MarketDataConfig;
  cache: CacheConfig;
  metrics: MetricsConfig;
  backtest: BacktestConfig;
  trading: TradingConfig;
  ai: AiConfig;
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

  errors.push(
    `${envName} must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(', ')}`,
  );
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

function parseDecimal(
  envName: string,
  rawValue: string | undefined,
  defaultValue: string,
  options: { min: number; max: number; scale: number },
  errors: string[],
): string {
  const normalized = normalizeOptional(rawValue);
  if (normalized === undefined) {
    return defaultValue;
  }

  const decimalPattern = new RegExp(`^\\d+(?:\\.\\d{1,${options.scale}})?$`);
  const parsed = Number(normalized);
  if (
    !decimalPattern.test(normalized) ||
    !Number.isFinite(parsed) ||
    parsed < options.min ||
    parsed > options.max
  ) {
    errors.push(
      `${envName} must be a decimal between ${options.min} and ${options.max} with at most ${options.scale} decimal places`,
    );
    return defaultValue;
  }

  return normalized;
}

function parseNodeEnvironment(
  rawValue: string | undefined,
  errors: string[],
): NodeEnvironment {
  const normalized = normalizeOptional(rawValue)?.toLowerCase() as
    NodeEnvironment | undefined;
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

function parseOptionalDatabaseUrl(
  rawValue: string | undefined,
  errors: string[],
): string | undefined {
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

function parseOptionalUrl(
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
    return normalized;
  } catch {
    errors.push(`${envName} must be a valid URL`);
    return undefined;
  }
}

function parseCsvUrls(
  envName: string,
  rawValue: string | undefined,
  errors: string[],
): string[] {
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
  const corsAllowedOrigins = parseCsvUrls(
    'CORS_ALLOWED_ORIGINS',
    env.CORS_ALLOWED_ORIGINS,
    errors,
  );
  const logLevel = parseLogLevel(env.LOG_LEVEL, errors);
  const logFilePath = normalizeOptional(env.LOG_FILE_PATH);
  const logToFile =
    parseBoolean('LOG_TO_FILE', env.LOG_TO_FILE, false, errors) ||
    Boolean(logFilePath);

  const readinessTimeoutMs = parseInteger(
    'READINESS_TIMEOUT_MS',
    env.READINESS_TIMEOUT_MS,
    DEFAULT_READINESS_TIMEOUT_MS,
    100,
    30000,
    errors,
  );

  const databaseUrl = parseOptionalDatabaseUrl(env.DATABASE_URL, errors);
  const marketDataHealthUrl = parseOptionalHttpUrl(
    'MARKET_DATA_HEALTH_URL',
    env.MARKET_DATA_HEALTH_URL,
    errors,
  );
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
  const webauthnRpId =
    normalizeOptional(env.WEBAUTHN_RP_ID) ?? DEFAULT_WEBAUTHN_RP_ID;
  const webauthnRpName =
    normalizeOptional(env.WEBAUTHN_RP_NAME) ?? DEFAULT_WEBAUTHN_RP_NAME;
  const webauthnAllowedOrigins = parseCsvUrls(
    'WEBAUTHN_ALLOWED_ORIGINS',
    env.WEBAUTHN_ALLOWED_ORIGINS,
    errors,
  );
  const googleClientId = normalizeOptional(env.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = normalizeOptional(env.GOOGLE_OAUTH_CLIENT_SECRET);
  const googleRedirectUri = parseOptionalUrl(
    'GOOGLE_OAUTH_REDIRECT_URI',
    env.GOOGLE_OAUTH_REDIRECT_URI,
    errors,
  );
  const appleClientId = normalizeOptional(env.APPLE_OAUTH_CLIENT_ID);
  const appleTeamId = normalizeOptional(env.APPLE_OAUTH_TEAM_ID);
  const appleKeyId = normalizeOptional(env.APPLE_OAUTH_KEY_ID);
  const applePrivateKey = normalizeOptional(env.APPLE_OAUTH_PRIVATE_KEY);
  const appleRedirectUri = parseOptionalUrl(
    'APPLE_OAUTH_REDIRECT_URI',
    env.APPLE_OAUTH_REDIRECT_URI,
    errors,
  );

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
    errors.push(
      'GOOGLE_OAUTH_CLIENT_ID is required when Google OAuth settings are provided',
    );
  }

  const appleValues = [
    appleClientId,
    appleTeamId,
    appleKeyId,
    applePrivateKey,
    appleRedirectUri,
  ];
  const anyAppleValue = appleValues.some((value) => value !== undefined);
  const allAppleValues = appleValues.every((value) => value !== undefined);

  if (anyAppleValue && !allAppleValues) {
    errors.push(
      'APPLE_OAUTH_CLIENT_ID, APPLE_OAUTH_TEAM_ID, APPLE_OAUTH_KEY_ID, APPLE_OAUTH_PRIVATE_KEY, and APPLE_OAUTH_REDIRECT_URI must all be set together',
    );
  }

  const jobTimeoutMs = parseInteger(
    'JOB_TIMEOUT_MS',
    env.JOB_TIMEOUT_MS,
    DEFAULT_JOB_TIMEOUT_MS,
    1000,
    300000,
    errors,
  );
  const schedulerEnabled = parseBoolean(
    'INGESTION_SCHEDULER_ENABLED',
    env.INGESTION_SCHEDULER_ENABLED,
    nodeEnv === 'development',
    errors,
  );
  const systemUserId =
    normalizeOptional(env.JOBS_SYSTEM_USER_ID) ?? DEFAULT_JOBS_SYSTEM_USER_ID;
  const staleEquityDailyMs = parseInteger(
    'MARKET_DATA_STALE_EQUITY_DAILY_MS',
    env.MARKET_DATA_STALE_EQUITY_DAILY_MS,
    DEFAULT_STALE_EQUITY_DAILY_MS,
    60_000,
    30 * 24 * 60 * 60 * 1000,
    errors,
  );
  const staleCryptoDailyMs = parseInteger(
    'MARKET_DATA_STALE_CRYPTO_DAILY_MS',
    env.MARKET_DATA_STALE_CRYPTO_DAILY_MS,
    DEFAULT_STALE_CRYPTO_DAILY_MS,
    60_000,
    30 * 24 * 60 * 60 * 1000,
    errors,
  );
  const staleCryptoHourlyMs = parseInteger(
    'MARKET_DATA_STALE_CRYPTO_HOURLY_MS',
    env.MARKET_DATA_STALE_CRYPTO_HOURLY_MS,
    DEFAULT_STALE_CRYPTO_HOURLY_MS,
    60_000,
    7 * 24 * 60 * 60 * 1000,
    errors,
  );
  const metricsEnabled = parseBoolean(
    'METRICS_ENABLED',
    env.METRICS_ENABLED,
    true,
    errors,
  );
  const cacheEnabled = parseBoolean(
    'CACHE_ENABLED',
    env.CACHE_ENABLED,
    true,
    errors,
  );
  const cacheCandlesTtlMs = parseInteger(
    'CACHE_CANDLES_TTL_MS',
    env.CACHE_CANDLES_TTL_MS,
    DEFAULT_CACHE_CANDLES_TTL_MS,
    1_000,
    3_600_000,
    errors,
  );
  const cacheSymbolsTtlMs = parseInteger(
    'CACHE_SYMBOLS_TTL_MS',
    env.CACHE_SYMBOLS_TTL_MS,
    DEFAULT_CACHE_SYMBOLS_TTL_MS,
    1_000,
    3_600_000,
    errors,
  );
  const cacheMaxEntries = parseInteger(
    'CACHE_MAX_ENTRIES',
    env.CACHE_MAX_ENTRIES,
    DEFAULT_CACHE_MAX_ENTRIES,
    10,
    100_000,
    errors,
  );
  const marketDataLiveEnabled = parseBoolean(
    'MARKET_DATA_LIVE_ENABLED',
    env.MARKET_DATA_LIVE_ENABLED,
    false,
    errors,
  );
  const marketDataCircuitFailures = parseInteger(
    'MARKET_DATA_CIRCUIT_FAILURES',
    env.MARKET_DATA_CIRCUIT_FAILURES,
    DEFAULT_CIRCUIT_FAILURES,
    1,
    100,
    errors,
  );
  const marketDataCircuitCooldownMs = parseInteger(
    'MARKET_DATA_CIRCUIT_COOLDOWN_MS',
    env.MARKET_DATA_CIRCUIT_COOLDOWN_MS,
    DEFAULT_CIRCUIT_COOLDOWN_MS,
    1_000,
    3_600_000,
    errors,
  );
  const backtestTimeoutMs = parseInteger(
    'BACKTEST_TIMEOUT_MS',
    env.BACKTEST_TIMEOUT_MS,
    DEFAULT_BACKTEST_TIMEOUT_MS,
    100,
    60_000,
    errors,
  );
  const backtestMaxBars = parseInteger(
    'BACKTEST_MAX_BARS',
    env.BACKTEST_MAX_BARS,
    DEFAULT_BACKTEST_MAX_BARS,
    1,
    1_000_000,
    errors,
  );
  const backtestMaxSeriesCells = parseInteger(
    'BACKTEST_MAX_SERIES_CELLS',
    env.BACKTEST_MAX_SERIES_CELLS,
    DEFAULT_BACKTEST_MAX_SERIES_CELLS,
    1,
    10_000_000,
    errors,
  );
  const backtestRateLimitWindowMs = parseInteger(
    'BACKTEST_RATE_LIMIT_WINDOW_MS',
    env.BACKTEST_RATE_LIMIT_WINDOW_MS,
    DEFAULT_BACKTEST_RATE_LIMIT_WINDOW_MS,
    1_000,
    3_600_000,
    errors,
  );
  const backtestRateLimitMaxRequests = parseInteger(
    'BACKTEST_RATE_LIMIT_MAX_REQUESTS',
    env.BACKTEST_RATE_LIMIT_MAX_REQUESTS,
    DEFAULT_BACKTEST_RATE_LIMIT_MAX_REQUESTS,
    1,
    10_000,
    errors,
  );
  const paperStartingBalance = parseDecimal(
    'PAPER_STARTING_BALANCE',
    env.PAPER_STARTING_BALANCE,
    DEFAULT_PAPER_STARTING_BALANCE,
    { min: 0.01, max: 9_999_999_999.99, scale: 2 },
    errors,
  );
  const maxOrderNotional = parseDecimal(
    'TRADING_MAX_ORDER_NOTIONAL',
    env.TRADING_MAX_ORDER_NOTIONAL,
    DEFAULT_TRADING_MAX_ORDER_NOTIONAL,
    { min: 0.01, max: 9_999_999_999.99, scale: 2 },
    errors,
  );
  const maxPositionPct = parseDecimal(
    'TRADING_MAX_POSITION_PCT',
    env.TRADING_MAX_POSITION_PCT,
    DEFAULT_TRADING_MAX_POSITION_PCT,
    { min: 0.01, max: 100, scale: 4 },
    errors,
  );
  const minCashRemaining = parseDecimal(
    'TRADING_MIN_CASH_REMAINING',
    env.TRADING_MIN_CASH_REMAINING,
    DEFAULT_TRADING_MIN_CASH_REMAINING,
    { min: 0, max: 9_999_999_999.99, scale: 2 },
    errors,
  );

  const aiEnabled = parseBoolean('AI_ENABLED', env.AI_ENABLED, false, errors);
  const aiProviderRaw =
    normalizeOptional(env.AI_PROVIDER)?.toLowerCase() ??
    (nodeEnv === 'test' ? 'stub' : 'openai');
  if (!AI_PROVIDERS.has(aiProviderRaw as AiProviderName)) {
    errors.push('AI_PROVIDER must be one of stub, openai');
  }
  const aiProvider = (
    AI_PROVIDERS.has(aiProviderRaw as AiProviderName)
      ? aiProviderRaw
      : nodeEnv === 'test'
        ? 'stub'
        : 'openai'
  ) as AiProviderName;
  const aiDailyCallLimit = parseInteger(
    'AI_DAILY_CALL_LIMIT',
    env.AI_DAILY_CALL_LIMIT,
    DEFAULT_AI_DAILY_CALL_LIMIT,
    1,
    1000,
    errors,
  );
  const aiTimeoutMs = parseInteger(
    'AI_TIMEOUT_MS',
    env.AI_TIMEOUT_MS,
    DEFAULT_AI_TIMEOUT_MS,
    1000,
    60_000,
    errors,
  );
  const aiMaxRetries = parseInteger(
    'AI_MAX_RETRIES',
    env.AI_MAX_RETRIES,
    DEFAULT_AI_MAX_RETRIES,
    0,
    3,
    errors,
  );
  const aiMaxOutputTokens = parseInteger(
    'AI_MAX_OUTPUT_TOKENS',
    env.AI_MAX_OUTPUT_TOKENS,
    DEFAULT_AI_MAX_OUTPUT_TOKENS,
    1,
    4000,
    errors,
  );
  const aiMaxContextChars = parseInteger(
    'AI_MAX_CONTEXT_CHARS',
    env.AI_MAX_CONTEXT_CHARS,
    DEFAULT_AI_MAX_CONTEXT_CHARS,
    1000,
    50_000,
    errors,
  );
  const aiLogContent = parseBoolean(
    'AI_LOG_CONTENT',
    env.AI_LOG_CONTENT,
    false,
    errors,
  );
  const aiDiffSuggestionsEnabled = parseBoolean(
    'AI_DIFF_SUGGESTIONS_ENABLED',
    env.AI_DIFF_SUGGESTIONS_ENABLED,
    false,
    errors,
  );
  const openaiApiKey = normalizeOptional(env.OPENAI_API_KEY);
  const aiModel =
    normalizeOptional(env.AI_MODEL) ??
    (aiEnabled && aiProvider === 'openai' ? '' : DEFAULT_AI_MODEL);

  if (aiEnabled && aiProvider === 'openai') {
    if (!openaiApiKey) {
      errors.push(
        'OPENAI_API_KEY is required when AI_ENABLED=true and AI_PROVIDER=openai',
      );
    }
    if (!aiModel) {
      errors.push(
        'AI_MODEL is required when AI_ENABLED=true and AI_PROVIDER=openai',
      );
    }
  }

  if (nodeEnv === 'production' && aiEnabled && aiProvider !== 'openai') {
    errors.push(
      'AI_PROVIDER must be openai when AI_ENABLED=true in production',
    );
  }

  if (aiLogContent && nodeEnv === 'production') {
    errors.push('AI_LOG_CONTENT must remain false in production');
  }

  if (nodeEnv === 'production') {
    if (!databaseUrl) {
      errors.push('DATABASE_URL is required in production');
    }
    if (corsAllowedOrigins.length === 0) {
      errors.push(
        'CORS_ALLOWED_ORIGINS is required in production and must list exact origins',
      );
    }
    if (corsAllowedOrigins.some((origin) => origin.includes('*'))) {
      errors.push(
        'CORS_ALLOWED_ORIGINS must not include wildcards in production',
      );
    }
    if (webauthnAllowedOrigins.length === 0) {
      errors.push(
        'WEBAUTHN_ALLOWED_ORIGINS is required in production and must list exact origins',
      );
    }
    if (webauthnAllowedOrigins.some((origin) => origin.includes('*'))) {
      errors.push(
        'WEBAUTHN_ALLOWED_ORIGINS must not include wildcards in production',
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n- ${errors.join('\n- ')}`);
  }

  return {
    server: {
      port,
      nodeEnv,
      corsAllowedOrigins:
        corsAllowedOrigins.length > 0
          ? corsAllowedOrigins
          : nodeEnv === 'production'
            ? []
            : ['http://localhost:4200'],
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
    jobs: {
      timeoutMs: jobTimeoutMs,
      schedulerEnabled: nodeEnv === 'test' ? false : schedulerEnabled,
      systemUserId,
    },
    marketData: {
      staleEquityDailyMs,
      staleCryptoDailyMs,
      staleCryptoHourlyMs,
      liveEnabled: marketDataLiveEnabled,
      circuitFailures: marketDataCircuitFailures,
      circuitCooldownMs: marketDataCircuitCooldownMs,
    },
    cache: {
      enabled: cacheEnabled,
      candlesTtlMs: cacheCandlesTtlMs,
      symbolsTtlMs: cacheSymbolsTtlMs,
      maxEntries: cacheMaxEntries,
    },
    metrics: {
      enabled: metricsEnabled,
    },
    backtest: {
      timeoutMs: backtestTimeoutMs,
      maxBars: backtestMaxBars,
      maxSeriesCells: backtestMaxSeriesCells,
      rateLimitWindowMs: backtestRateLimitWindowMs,
      rateLimitMaxRequests: backtestRateLimitMaxRequests,
    },
    trading: {
      paperStartingBalance,
      maxOrderNotional,
      maxPositionPct,
      minCashRemaining,
    },
    ai: {
      enabled: aiEnabled,
      provider: aiProvider,
      model: aiModel || DEFAULT_AI_MODEL,
      dailyCallLimit: aiDailyCallLimit,
      timeoutMs: aiTimeoutMs,
      maxRetries: aiMaxRetries,
      maxOutputTokens: aiMaxOutputTokens,
      maxContextChars: aiMaxContextChars,
      logContent: aiLogContent,
      openaiApiKey,
      diffSuggestionsEnabled: aiDiffSuggestionsEnabled,
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

  get jobs(): JobsConfig {
    return this.config.jobs;
  }

  get marketData(): MarketDataConfig {
    return this.config.marketData;
  }

  get cache(): CacheConfig {
    return this.config.cache;
  }

  get metrics(): MetricsConfig {
    return this.config.metrics;
  }

  get backtest(): BacktestConfig {
    return this.config.backtest;
  }

  get trading(): TradingConfig {
    return this.config.trading;
  }

  get ai(): AiConfig {
    return this.config.ai;
  }
}
