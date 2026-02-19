import { RequestIdMiddleware, REQUEST_ID_HEADER } from './request-id.middleware';

jest.mock('crypto', () => ({
  randomUUID: jest.fn(() => 'uuid-123'),
}));

describe('RequestIdMiddleware', () => {
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    middleware = new RequestIdMiddleware();
  });

  it('uses header request id when provided', () => {
    const req: any = { headers: { [REQUEST_ID_HEADER]: 'header-id' } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('header-id');
    expect(req.id).toBe('header-id');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'header-id');
    expect(next).toHaveBeenCalled();
  });

  it('uses the first header value when multiple are provided', () => {
    const req: any = { headers: { [REQUEST_ID_HEADER]: ['first', 'second'] } };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('first');
    expect(req.id).toBe('first');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'first');
  });

  it('reuses existing request id when header missing', () => {
    const req: any = { headers: {}, requestId: 'existing-id' };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('existing-id');
    expect(req.id).toBe('existing-id');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'existing-id');
  });

  it('generates a new request id when none exists', () => {
    const req: any = { headers: {} };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe('uuid-123');
    expect(req.id).toBe('uuid-123');
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'uuid-123');
  });
});
