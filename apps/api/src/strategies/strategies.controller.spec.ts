import { AUTH_TOKEN_REQUEST_KEY } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import type { AuthService } from '../auth/auth.service';
import { DomainError } from '../common/errors/domain-error';
import type { StrategiesService } from './strategies.service';
import { StrategiesController } from './strategies.controller';
import type { CreateStrategyDto } from './dto/create-strategy.dto';

describe('StrategiesController', () => {
  const response = {
    id: '48b9dc46-e9f4-4f9b-8bf6-b0b86a40aa89',
    name: 'Momentum',
    description: null,
    asset_type: 'EQUITY' as const,
    symbol_scope: 'SINGLE' as const,
    timeframe: '1d' as const,
    is_active: true,
    version_number: 1,
    definition: {},
    created_at: '2026-07-25T12:00:00.000Z',
    updated_at: '2026-07-25T12:00:00.000Z',
  };

  function createController() {
    const strategiesService = {
      create: jest.fn().mockResolvedValue(response),
      getById: jest.fn().mockResolvedValue(response),
    } as unknown as StrategiesService;
    const authService = {
      requireUserBySessionToken: jest.fn().mockReturnValue({ id: 'user-1' }),
    } as unknown as AuthService;

    return {
      controller: new StrategiesController(strategiesService, authService),
      strategiesService,
      authService,
    };
  }

  function authenticatedRequest(): AuthenticatedRequest {
    return {
      [AUTH_TOKEN_REQUEST_KEY]: 'session-token',
    } as AuthenticatedRequest;
  }

  it('creates a strategy for the authenticated user', async () => {
    const { controller, strategiesService, authService } = createController();
    const dto: CreateStrategyDto = {
      name: 'Momentum',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: {},
    };

    await expect(
      controller.create(authenticatedRequest(), dto),
    ).resolves.toEqual(response);
    expect(authService.requireUserBySessionToken).toHaveBeenCalledWith(
      'session-token',
    );
    expect(strategiesService.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('gets an owned strategy by id', async () => {
    const { controller, strategiesService } = createController();

    await expect(
      controller.getById(authenticatedRequest(), response.id),
    ).resolves.toEqual(response);
    expect(strategiesService.getById).toHaveBeenCalledWith(
      'user-1',
      response.id,
    );
  });

  it('fails closed when the guard context has no token', () => {
    const { controller } = createController();
    const dto: CreateStrategyDto = {
      name: 'Momentum',
      asset_type: 'EQUITY',
      timeframe: '1d',
      definition: {},
    };

    expect(() => controller.create({} as AuthenticatedRequest, dto)).toThrow(
      DomainError,
    );
  });
});
