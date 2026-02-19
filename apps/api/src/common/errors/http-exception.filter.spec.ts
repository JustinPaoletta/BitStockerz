import { ArgumentsHost, HttpStatus, HttpException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { GlobalHttpExceptionFilter } from './http-exception.filter';
import { ErrorCode } from './error-codes.enum';
import { DomainError } from './domain-error';
import { RequestWithRequestId } from './http-exception.filter';

function mockArgumentsHost(
  requestOverrides: Partial<RequestWithRequestId> = {},
): ArgumentsHost {
  const request = {
    path: '/api/strategies',
    url: '/api/strategies',
    headers: {},
    ...requestOverrides,
  } as RequestWithRequestId;
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;
  let logger: PinoLogger;

  beforeEach(() => {
    logger = {
      setContext: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn(),
    } as unknown as PinoLogger;
    filter = new GlobalHttpExceptionFilter(logger);
  });

  it('sets logger context on construction', () => {
    const ctxLogger = {
      setContext: jest.fn(),
    } as unknown as PinoLogger;
    new GlobalHttpExceptionFilter(ctxLogger);
    expect(ctxLogger.setContext).toHaveBeenCalledWith(GlobalHttpExceptionFilter.name);
  });

  it('maps DomainError to RFC 7807 with correct code and status', () => {
    const host = mockArgumentsHost({ requestId: 'test-request-id' });
    const exception = new DomainError(ErrorCode.FORBIDDEN, 'Custom message');
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'FORBIDDEN',
        status: 403,
        title: 'Forbidden',
        detail: 'Custom message',
        instance: '/api/strategies',
        requestId: 'test-request-id',
        type: 'https://bitstockerz.dev/errors/forbidden',
      }),
    );
  });

  it('uses default detail for DomainError when message is omitted', () => {
    const host = mockArgumentsHost({ requestId: 'req-domain-default' });
    const exception = new DomainError(ErrorCode.UNAUTHORIZED);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.detail).toBe('Authentication is required.');
  });

  it('uses empty detail for DomainError when catalog default is missing', () => {
    const originalDetail = (require('./error-catalog') as typeof import('./error-catalog'))
      .ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail;
    (require('./error-catalog') as typeof import('./error-catalog'))
      .ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail = undefined;
    try {
      const host = mockArgumentsHost({ requestId: 'req-domain-empty' });
      class CustomDomainError extends DomainError {
        getResponse() {
          return {};
        }
      }
      const exception = new CustomDomainError(ErrorCode.FORBIDDEN);
      filter.catch(exception, host);
      const res = (host as any).switchToHttp().getResponse();
      const body = res.json.mock.calls[0][0];
      expect(body.detail).toBe('');
    } finally {
      (require('./error-catalog') as typeof import('./error-catalog'))
        .ERROR_CATALOG[ErrorCode.FORBIDDEN].defaultDetail = originalDetail;
    }
  });

  it('maps HttpException 400 (validation) to VALIDATION_ERROR with fieldErrors', () => {
    const host = mockArgumentsHost({ requestId: 'req-1' });
    const exception = new HttpException(
      { message: ['name must be a string', 'asset_type is invalid'] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBe('req-1');
    expect(body.fieldErrors).toEqual(
      expect.arrayContaining([
        { field: 'body', reason: 'name must be a string' },
        { field: 'body', reason: 'asset_type is invalid' },
      ]),
    );
  });

  it('maps HttpException 401 to UNAUTHORIZED with response message', () => {
    const host = mockArgumentsHost({ requestId: 'req-401' });
    const exception = new HttpException(
      { message: 'Authentication required' },
      HttpStatus.UNAUTHORIZED,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.status).toBe(401);
    expect(body.detail).toBe('Authentication required');
    expect(body.requestId).toBe('req-401');
  });

  it('maps HttpException 403 to FORBIDDEN and uses message from response', () => {
    const host = mockArgumentsHost({ requestId: 'req-403' });
    const exception = new HttpException(
      { message: 'Access denied' },
      HttpStatus.FORBIDDEN,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('FORBIDDEN');
    expect(body.detail).toBe('Access denied');
  });

  it('maps HttpException 409 to CONFLICT', () => {
    const host = mockArgumentsHost({ requestId: 'req-409' });
    const exception = new HttpException(
      { message: 'Conflict detected' },
      HttpStatus.CONFLICT,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('CONFLICT');
    expect(body.detail).toBe('Conflict detected');
  });

  it('maps HttpException 429 to RATE_LIMITED and uses exception message when no response message', () => {
    const host = mockArgumentsHost({ requestId: 'req-429' });
    const exception = new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.detail).toBe('Too many requests');
  });

  it('maps unrecognized status to INTERNAL_ERROR', () => {
    const host = mockArgumentsHost({ requestId: 'req-418' });
    const exception = new HttpException('teapot', HttpStatus.I_AM_A_TEAPOT);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('normalizes validation errors from error objects', () => {
    const host = mockArgumentsHost({ requestId: 'req-obj' });
    const exception = new HttpException(
      {
        errors: [
          { property: 'name', constraints: { isString: 'name must be a string' } },
        ],
      },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.fieldErrors).toEqual([{ field: 'name', reason: 'name must be a string' }]);
  });

  it('normalizes validation errors from string response', () => {
    const host = mockArgumentsHost({ requestId: 'req-str' });
    const exception = new HttpException('single error', HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.fieldErrors).toEqual([{ field: 'body', reason: 'single error' }]);
  });

  it('normalizes validation errors from message array with non-string entries', () => {
    const host = mockArgumentsHost({ requestId: 'req-mixed' });
    const exception = new HttpException(
      { message: ['bad', 123] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([
      { field: 'body', reason: 'bad' },
      { field: 'body', reason: '123' },
    ]);
  });

  it('normalizes validation errors from string array response', () => {
    const host = mockArgumentsHost({ requestId: 'req-arr' });
    const exception = new HttpException(['a', 'b'], HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([
      { field: 'body', reason: 'a' },
      { field: 'body', reason: 'b' },
    ]);
  });

  it('normalizes validation errors when response has message string', () => {
    const host = mockArgumentsHost({ requestId: 'req-msg' });
    const exception = new HttpException({ message: 'bad payload' }, HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([{ field: 'body', reason: 'bad payload' }]);
  });

  it('uses body as field when error property is missing', () => {
    const host = mockArgumentsHost({ requestId: 'req-noprop' });
    const exception = new HttpException(
      { errors: [{ constraints: { isString: 'name must be a string' } }] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([{ field: 'body', reason: 'name must be a string' }]);
  });

  it('uses generic invalid reason when constraints are missing', () => {
    const host = mockArgumentsHost({ requestId: 'req-missing' });
    const exception = new HttpException(
      { errors: [{ property: 'name' }] },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([{ field: 'name', reason: 'invalid' }]);
  });

  it('falls back to validation failed when no message or errors exist', () => {
    const host = mockArgumentsHost({ requestId: 'req-fallback' });
    const exception = new HttpException({}, HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.fieldErrors).toEqual([{ field: 'body', reason: 'Validation failed' }]);
  });

  it('uses exception message when non-validation response has no message field', () => {
    const host = mockArgumentsHost({ requestId: 'req-no-msg' });
    const exception = new HttpException(
      { error: 'no message field' },
      HttpStatus.NOT_FOUND,
    );
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('NOT_FOUND');
    expect(body.detail).toBe('Http Exception');
  });

  it('uses default detail when validation response has no message', () => {
    const host = mockArgumentsHost({ requestId: 'req-default' });
    const exception = new HttpException({ errors: [] }, HttpStatus.BAD_REQUEST);
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.detail).toBe('One or more fields are invalid.');
  });

  it('uses empty detail when validation default detail is missing', () => {
    const catalog = require('./error-catalog') as typeof import('./error-catalog');
    const originalDetail = catalog.ERROR_CATALOG[ErrorCode.VALIDATION_ERROR].defaultDetail;
    catalog.ERROR_CATALOG[ErrorCode.VALIDATION_ERROR].defaultDetail = undefined;
    try {
      const host = mockArgumentsHost({ requestId: 'req-default-empty' });
      const exception = new HttpException({ errors: [] }, HttpStatus.BAD_REQUEST);
      filter.catch(exception, host);
      const res = (host as any).switchToHttp().getResponse();
      const body = res.json.mock.calls[0][0];
      expect(body.detail).toBe('');
    } finally {
      catalog.ERROR_CATALOG[ErrorCode.VALIDATION_ERROR].defaultDetail = originalDetail;
    }
  });

  it('falls back to request id when requestId property is missing', () => {
    const host = mockArgumentsHost({ id: 'req-only-id' });
    const exception = new DomainError(ErrorCode.FORBIDDEN, 'No access');
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-only-id');
  });

  it('falls back to unknown request id when neither id nor requestId exist', () => {
    const host = mockArgumentsHost({ requestId: undefined, id: undefined, path: '/api/strategies' });
    const exception = new DomainError(ErrorCode.FORBIDDEN, 'No access');
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    const body = res.json.mock.calls[0][0];
    expect(body.requestId).toBe('unknown');
  });

  it('uses url when path is missing and falls back to "/" when both are missing', () => {
    const hostUrl = mockArgumentsHost({ requestId: 'req-url', path: undefined, url: '/api/url-only' });
    const exception = new DomainError(ErrorCode.FORBIDDEN, 'No access');
    filter.catch(exception, hostUrl);
    const resUrl = (hostUrl as any).switchToHttp().getResponse();
    const bodyUrl = resUrl.json.mock.calls[0][0];
    expect(bodyUrl.instance).toBe('/api/url-only');

    const hostRoot = mockArgumentsHost({ requestId: 'req-root', path: undefined, url: undefined });
    filter.catch(exception, hostRoot);
    const resRoot = (hostRoot as any).switchToHttp().getResponse();
    const bodyRoot = resRoot.json.mock.calls[0][0];
    expect(bodyRoot.instance).toBe('/');
  });

  it('maps unknown errors to INTERNAL_ERROR with no stack and generic detail', () => {
    const host = mockArgumentsHost({ requestId: 'req-2' });
    const exception = new Error('Sensitive internal message');
    filter.catch(exception, host);
    const res = (host as any).switchToHttp().getResponse();
    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.detail).toBe('An unexpected error occurred.');
    expect(body).not.toHaveProperty('stack');
  });

  it('uses fallback internal detail when catalog default is missing', () => {
    const catalog = require('./error-catalog') as typeof import('./error-catalog');
    const originalDetail = catalog.ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail;
    catalog.ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail = undefined;
    try {
      const host = mockArgumentsHost({ requestId: 'req-internal-fallback' });
      const exception = new Error('boom');
      filter.catch(exception, host);
      const res = (host as any).switchToHttp().getResponse();
      const body = res.json.mock.calls[0][0];
      expect(body.detail).toBe('An unexpected error occurred.');
    } finally {
      catalog.ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail = originalDetail;
    }
  });

  it('logs non-Error exceptions with stringified message', () => {
    const host = mockArgumentsHost({ requestId: 'req-str-err' });
    filter.catch('boom', host);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-str-err',
        error: { message: 'boom' },
      }),
      'Unhandled error',
    );
  });

  it('covers metadata fallback when PinoLogger is not a function', () => {
    jest.resetModules();
    jest.doMock('nestjs-pino', () => ({ PinoLogger: undefined }));
    jest.isolateModules(() => {
      require('./http-exception.filter');
    });
    jest.dontMock('nestjs-pino');
  });

});
