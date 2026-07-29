import { AUTH_TOKEN_REQUEST_KEY } from '../auth/auth.guard';
import { DomainError } from '../common/errors/domain-error';
import { BacktestsController } from './backtests.controller';

describe('BacktestsController', () => {
  const http = {
    create: jest.fn(),
    list: jest.fn(),
    detail: jest.fn(),
  };
  const auth = {
    requireUserBySessionToken: jest.fn(() => ({ id: 'user-1' })),
  };
  const controller = new BacktestsController(http as never, auth as never);
  const request = {
    [AUTH_TOKEN_REQUEST_KEY]: 'token',
    requestId: 'request-1',
  } as never;

  beforeEach(() => jest.clearAllMocks());

  it('delegates create, list, and detail with authenticated ownership', async () => {
    const dto = {
      strategy_id: crypto.randomUUID(),
      symbol: 'AAPL',
      timeframe: '1d' as const,
      start_date: '2026-01-01',
      end_date: '2026-01-02',
    };
    await controller.create(request, dto);
    await controller.list(request, { limit: 10 });
    await controller.detail(request, crypto.randomUUID(), { trades_limit: 1 });
    expect(http.create).toHaveBeenCalledWith('user-1', dto, 'request-1');
    expect(http.list).toHaveBeenCalledWith('user-1', { limit: 10 });
    expect(http.detail).toHaveBeenCalledWith('user-1', expect.any(String), {
      trades_limit: 1,
    });
  });

  it('defensively rejects requests without the guard-established token', () => {
    expect(() => controller.list({} as never, {})).toThrow(DomainError);
  });
});
