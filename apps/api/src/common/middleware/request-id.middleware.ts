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
    const headerValue = req.headers[REQUEST_ID_HEADER];
    const headerId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const existingId = (req as Request & { requestId?: string; id?: string }).requestId ?? (req as Request & { id?: string }).id;
    const id = headerId ?? existingId ?? randomUUID();
    (req as Request & { requestId: string; id?: string }).requestId = id;
    (req as Request & { id: string }).id = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
