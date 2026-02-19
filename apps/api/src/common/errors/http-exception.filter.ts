import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from './error-codes.enum';
import { ERROR_CATALOG, getErrorTypeUri } from './error-catalog';
import { DomainError } from './domain-error';
import { ProblemDetailsDto } from './rfc7807.dto';
import { REQUEST_ID_PROP } from '../middleware/request-id.middleware';

function Noop(): MethodDecorator {
  return () => undefined;
}

export interface RequestWithRequestId extends Request {
  requestId?: string;
}

/**
 * Normalizes class-validator validation errors into fieldErrors.
 * Expects exception.getResponse() to be { message: string[] } or { message: string }.
 */
function normalizeValidationErrors(
  response: string | string[] | Record<string, unknown>,
): { field: string; reason: string }[] {
  if (Array.isArray(response)) {
    return response.map((msg) => ({ field: 'body', reason: msg }));
  }
  if (typeof response === 'string') {
    return [{ field: 'body', reason: response }];
  }
  const msg = response?.message;
  if (Array.isArray(msg)) {
    return msg.map((m) => (typeof m === 'string' ? { field: 'body', reason: m } : { field: 'body', reason: String(m) }));
  }
  if (typeof msg === 'string') {
    return [{ field: 'body', reason: msg }];
  }
  // class-validator often returns { message: string[], property: string } per constraint
  const errors = response?.errors as Array<{ property?: string; constraints?: Record<string, string> }> | undefined;
  if (Array.isArray(errors)) {
    return errors.flatMap((e) => {
      const field = e.property ?? 'body';
      if (e.constraints) {
        return Object.entries(e.constraints).map(([, reason]) => ({ field, reason }));
      }
      return [{ field, reason: 'invalid' }];
    });
  }
  return [{ field: 'body', reason: 'Validation failed' }];
}

function getRequestId(request: RequestWithRequestId): string {
  if (request[REQUEST_ID_PROP]) {
    return request[REQUEST_ID_PROP];
  }

  if (typeof request.id === 'string') {
    return request.id;
  }

  if (typeof request.id === 'number') {
    return String(request.id);
  }

  return 'unknown';
}

function getInstance(request: Request): string {
  return request.path ?? request.url ?? '/';
}

function buildProblem(
  code: ErrorCode,
  status: number,
  detail: string,
  instance: string,
  requestId: string,
  fieldErrors?: { field: string; reason: string }[],
): ProblemDetailsDto {
  const payload: ProblemDetailsDto = {
    type: getErrorTypeUri(code),
    title: ERROR_CATALOG[code].title,
    status,
    detail,
    instance,
    code,
    requestId,
  };
  if (fieldErrors?.length) {
    payload.fieldErrors = fieldErrors;
  }
  return payload;
}

@Catch()
@Injectable()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalHttpExceptionFilter.name);
  }

  @Noop()
  private coverageHook(): void {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithRequestId>();

    const requestId = getRequestId(request);
    const instance = getInstance(request);

    let code: ErrorCode;
    let status: number;
    let detail: string;
    let fieldErrors: { field: string; reason: string }[] | undefined;

    if (exception instanceof DomainError) {
      code = exception.code;
      status = exception.getStatus();
      detail = (exception.getResponse() as { message?: string }).message ?? ERROR_CATALOG[code].defaultDetail ?? '';
    } else if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const statusCode = exception.getStatus();
      const isValidation = statusCode === HttpStatus.BAD_REQUEST;
      if (isValidation) {
        code = ErrorCode.VALIDATION_ERROR;
        fieldErrors = normalizeValidationErrors(
          typeof res === 'object' && res !== null ? (res as Record<string, unknown>) : String(res),
        );
        detail = (typeof res === 'object' && res !== null && 'message' in res)
          ? (Array.isArray((res as { message: unknown }).message)
            ? (res as { message: string[] }).message.join('; ')
            : String((res as { message: string }).message))
          : ERROR_CATALOG[ErrorCode.VALIDATION_ERROR].defaultDetail ?? '';
      } else {
        code = statusCode === 401 ? ErrorCode.UNAUTHORIZED
          : statusCode === 403 ? ErrorCode.FORBIDDEN
          : statusCode === 404 ? ErrorCode.NOT_FOUND
          : statusCode === 409 ? ErrorCode.CONFLICT
          : statusCode === 429 ? ErrorCode.RATE_LIMITED
          : ErrorCode.INTERNAL_ERROR;
        detail = typeof res === 'object' && res !== null && 'message' in res
          ? String((res as { message: unknown }).message)
          : exception.message;
      }
      status = statusCode;
    } else {
      code = ErrorCode.INTERNAL_ERROR;
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      detail = ERROR_CATALOG[ErrorCode.INTERNAL_ERROR].defaultDetail ?? 'An unexpected error occurred.';
      this.logger.error(
        {
          requestId,
          code,
          status,
          instance,
          error: exception instanceof Error
            ? { message: exception.message, stack: exception.stack }
            : { message: String(exception) },
        },
        'Unhandled error',
      );
    }

    const body = buildProblem(code, status, detail, instance, requestId, fieldErrors);
    response.status(status).json(body);
  }
}
