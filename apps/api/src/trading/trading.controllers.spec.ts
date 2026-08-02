import type { AuthService } from '../auth/auth.service';
import {
  AUTH_TOKEN_REQUEST_KEY,
  type AuthenticatedRequest,
} from '../auth/auth.guard';
import { ErrorCode } from '../common/errors/error-codes.enum';
import { OrdersController } from './orders.controller';
import type { OrdersService } from './orders.service';
import { PaperAccountsController } from './paper-accounts.controller';
import type { PaperAccountsService } from './paper-accounts.service';
import { TradingViewsController } from './trading-views.controller';
import type { TradingViewsService } from './trading-views.service';

const request = {
  [AUTH_TOKEN_REQUEST_KEY]: 'session-token',
} as AuthenticatedRequest;

describe('paper trading controllers', () => {
  const auth = {
    requireUserBySessionToken: jest.fn().mockReturnValue({ id: 'user-1' }),
  } as unknown as AuthService;

  it('maps order DTOs and applies pagination defaults', async () => {
    const orders = {
      placeMarketOrder: jest.fn().mockResolvedValue({}),
      listOrders: jest.fn().mockResolvedValue({ orders: [] }),
      listExecutions: jest.fn().mockResolvedValue({ executions: [] }),
    } as unknown as OrdersService;
    const controller = new OrdersController(orders, auth);

    await controller.place(request, {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1',
      client_order_id: 'client-1',
    });
    await controller.listOrders(request, {});
    await controller.listExecutions(request, {});
    await controller.listOrders(request, { limit: 5, offset: 2 });
    await controller.listExecutions(request, { limit: 6, offset: 3 });

    expect(orders.placeMarketOrder).toHaveBeenCalledWith('user-1', {
      symbol: 'AAPL',
      side: 'BUY',
      quantity: '1',
      clientOrderId: 'client-1',
    });
    expect(orders.listOrders).toHaveBeenNthCalledWith(1, 'user-1', {
      status: undefined,
      symbol: undefined,
      limit: 50,
      offset: 0,
    });
    expect(orders.listOrders).toHaveBeenNthCalledWith(2, 'user-1', {
      status: undefined,
      symbol: undefined,
      limit: 5,
      offset: 2,
    });
    expect(orders.listExecutions).toHaveBeenNthCalledWith(1, 'user-1', {
      symbol: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it('rejects direct controller calls without the guard token', async () => {
    const orders = {} as OrdersService;
    const views = {} as TradingViewsService;
    const accounts = {} as PaperAccountsService;

    expect(() =>
      new OrdersController(orders, auth).listOrders(
        {} as AuthenticatedRequest,
        {},
      ),
    ).toThrow(expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }));
    expect(() =>
      new TradingViewsController(views, auth).positions(
        {} as AuthenticatedRequest,
      ),
    ).toThrow(expect.objectContaining({ code: ErrorCode.UNAUTHORIZED }));
    await expect(
      new PaperAccountsController(accounts, auth).get(
        {} as AuthenticatedRequest,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.UNAUTHORIZED });
  });

  it('routes paper-account and portfolio reads for the session owner', async () => {
    const account = { id: 7 };
    const accounts = {
      getForUser: jest.fn().mockResolvedValue(account),
      toResponse: jest.fn().mockReturnValue({ id: 7 }),
    } as unknown as PaperAccountsService;
    const views = {
      listPositions: jest.fn().mockResolvedValue({ positions: [] }),
      getPortfolioSummary: jest
        .fn()
        .mockResolvedValue({ total_equity: '0.00' }),
    } as unknown as TradingViewsService;

    await expect(
      new PaperAccountsController(accounts, auth).get(request),
    ).resolves.toEqual({ id: 7 });
    const viewsController = new TradingViewsController(views, auth);
    await viewsController.positions(request);
    await viewsController.portfolioSummary(request);

    expect(accounts.getForUser).toHaveBeenCalledWith('user-1');
    expect(views.listPositions).toHaveBeenCalledWith('user-1');
    expect(views.getPortfolioSummary).toHaveBeenCalledWith('user-1');
  });
});
