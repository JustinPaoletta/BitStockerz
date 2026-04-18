import { MeController } from './me.controller';
import type { AuthenticatedRequest } from './auth.guard';
import type { AuthService } from './auth.service';

describe('MeController', () => {
  it('returns current user profile', () => {
    const getProfileMock = jest.fn(() => ({
      id: 'u1',
      email: 'user@example.com',
    }));

    const authService = {
      getProfileBySessionToken: getProfileMock,
      updateProfileBySessionToken: jest.fn(),
    } as unknown as AuthService;

    const controller = new MeController(authService);
    const request = { authToken: 'token-1' } as unknown as AuthenticatedRequest;
    const profile = controller.me(request);

    expect(getProfileMock).toHaveBeenCalledWith('token-1');
    expect(profile).toEqual({ id: 'u1', email: 'user@example.com' });
  });

  it('updates profile for current user', () => {
    const updateProfileMock = jest.fn(() => ({
      id: 'u1',
      email: 'user@example.com',
      display_name: 'Trader',
      base_currency: 'USD',
    }));

    const authService = {
      getProfileBySessionToken: jest.fn(),
      updateProfileBySessionToken: updateProfileMock,
    } as unknown as AuthService;

    const controller = new MeController(authService);
    const payload = { display_name: 'Trader', base_currency: 'USD' as const };
    const request = { authToken: 'token-2' } as unknown as AuthenticatedRequest;
    const profile = controller.update(request, payload);

    expect(updateProfileMock).toHaveBeenCalledWith('token-2', payload);
    expect(profile.display_name).toBe('Trader');
  });
});
