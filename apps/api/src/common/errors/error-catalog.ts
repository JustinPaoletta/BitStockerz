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
  [ErrorCode.CONFLICT]: {
    httpStatus: 409,
    typeSuffix: 'conflict',
    title: 'Conflict',
    defaultDetail: 'The request conflicts with the current state of the resource.',
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
