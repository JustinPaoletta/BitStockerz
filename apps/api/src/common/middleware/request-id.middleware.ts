import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_PROP = 'requestId';

/**
 * Attaches a correlation ID to each request. Uses x-request-id if present, otherwise generates a UUID.
 * The ID is available on request.requestId for the exception filter and logging.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const id = (req.headers[REQUEST_ID_HEADER] as string) ?? randomUUID();
    (req as Request & { requestId: string }).requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
