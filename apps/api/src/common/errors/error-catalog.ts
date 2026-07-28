import { ErrorCode } from './error-codes.enum';

const ERROR_BASE_URL = 'https://bitstockerz.dev/errors';

export interface ErrorCatalogEntry {
  httpStatus: number;
  typeSuffix: string;
  title: string;
  defaultDetail?: string;
}

export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  [ErrorCode.VALIDATION_ERROR]: {
    httpStatus: 400,
    typeSuffix: 'validation',
    title: 'Validation error',
    defaultDetail: 'One or more fields are invalid.',
  },
  [ErrorCode.UNAUTHORIZED]: {
    httpStatus: 401,
    typeSuffix: 'unauthorized',
    title: 'Unauthorized',
    defaultDetail: 'Authentication is required.',
  },
  [ErrorCode.FORBIDDEN]: {
    httpStatus: 403,
    typeSuffix: 'forbidden',
    title: 'Forbidden',
    defaultDetail: 'You do not have permission to perform this action.',
  },
  [ErrorCode.NOT_FOUND]: {
    httpStatus: 404,
    typeSuffix: 'not-found',
    title: 'Not found',
    defaultDetail: 'The requested resource was not found.',
  },
  [ErrorCode.STRATEGY_NOT_FOUND]: {
    httpStatus: 404,
    typeSuffix: 'strategy-not-found',
    title: 'Strategy not found',
    defaultDetail: 'The requested strategy was not found.',
  },
  [ErrorCode.STRATEGY_VERSION_NOT_FOUND]: {
    httpStatus: 404,
    typeSuffix: 'strategy-version-not-found',
    title: 'Strategy version not found',
    defaultDetail: 'The requested strategy version was not found.',
  },
  [ErrorCode.STRATEGY_VALIDATION_ERROR]: {
    httpStatus: 400,
    typeSuffix: 'strategy-validation',
    title: 'Strategy validation error',
    defaultDetail: 'The strategy definition is invalid.',
  },
  [ErrorCode.BACKTEST_INVALID_DEFINITION]: {
    httpStatus: 400,
    typeSuffix: 'backtest-invalid-definition',
    title: 'Invalid backtest definition',
    defaultDetail: 'The backtest definition is invalid.',
  },
  [ErrorCode.BACKTEST_INSUFFICIENT_BARS]: {
    httpStatus: 400,
    typeSuffix: 'backtest-insufficient-bars',
    title: 'Insufficient backtest bars',
    defaultDetail: 'The backtest does not have enough bars to run.',
  },
  [ErrorCode.BACKTEST_BAR_LIMIT_EXCEEDED]: {
    httpStatus: 400,
    typeSuffix: 'backtest-bar-limit-exceeded',
    title: 'Backtest bar limit exceeded',
    defaultDetail: 'The backtest contains too many bars.',
  },
  [ErrorCode.BACKTEST_RESOURCE_LIMIT_EXCEEDED]: {
    httpStatus: 400,
    typeSuffix: 'backtest-resource-limit-exceeded',
    title: 'Backtest resource limit exceeded',
    defaultDetail: 'The backtest exceeds its resource limits.',
  },
  [ErrorCode.BACKTEST_TIMEOUT]: {
    httpStatus: 504,
    typeSuffix: 'backtest-timeout',
    title: 'Backtest timed out',
    defaultDetail: 'The backtest exceeded its execution deadline.',
  },
  [ErrorCode.CONFLICT]: {
    httpStatus: 409,
    typeSuffix: 'conflict',
    title: 'Conflict',
    defaultDetail:
      'The request conflicts with the current state of the resource.',
  },
  [ErrorCode.RATE_LIMITED]: {
    httpStatus: 429,
    typeSuffix: 'rate-limited',
    title: 'Rate limited',
    defaultDetail: 'Too many requests. Please try again later.',
  },
  [ErrorCode.INTERNAL_ERROR]: {
    httpStatus: 500,
    typeSuffix: 'internal',
    title: 'Internal server error',
    defaultDetail: 'An unexpected error occurred.',
  },
};

export function getErrorTypeUri(code: ErrorCode): string {
  return `${ERROR_BASE_URL}/${ERROR_CATALOG[code].typeSuffix}`;
}
