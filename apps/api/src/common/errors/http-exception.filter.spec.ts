import { ArgumentsHost, HttpStatus, HttpException } from '@nestjs/common';
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

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();
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
});
