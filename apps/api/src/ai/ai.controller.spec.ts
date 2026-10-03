import { AiController } from './ai.controller';
import type { AuthenticatedRequest } from '../auth/auth.guard';
import { AUTH_TOKEN_REQUEST_KEY } from '../auth/auth.guard';
import type { AuthService } from '../auth/auth.service';
import type { BacktestIntelligenceService } from './backtest-intelligence.service';
import type { StrategyIntelligenceService } from './strategy-intelligence.service';

describe('AiController', () => {
  const strategyIntelligence = {
    explainStrategy: jest.fn(),
    validateStrategy: jest.fn(),
  };
  const backtestIntelligence = {
    explainBacktest: jest.fn(),
    suggestImprovements: jest.fn(),
  };
  const authService = {
    requireUserBySessionToken: jest.fn().mockReturnValue({ id: 'user-1' }),
  };

  const controller = new AiController(
    strategyIntelligence as unknown as StrategyIntelligenceService,
    backtestIntelligence as unknown as BacktestIntelligenceService,
    authService as unknown as AuthService,
  );

  function request(): AuthenticatedRequest {
    return {
      [AUTH_TOKEN_REQUEST_KEY]: 'token',
    } as AuthenticatedRequest;
  }

  it('delegates explain/validate/suggest endpoints', async () => {
    strategyIntelligence.explainStrategy.mockResolvedValue({ ok: true });
    strategyIntelligence.validateStrategy.mockResolvedValue({ ok: true });
    backtestIntelligence.explainBacktest.mockResolvedValue({ ok: true });
    backtestIntelligence.suggestImprovements.mockResolvedValue({ ok: true });

    await expect(
      controller.explainStrategy(request(), { strategy_id: 's1' }),
    ).resolves.toEqual({ ok: true });
    await expect(
      controller.validateStrategy(request(), { strategy_id: 's1' }),
    ).resolves.toEqual({ ok: true });
    await expect(
      controller.explainBacktest(request(), { backtest_run_id: 'b1' }),
    ).resolves.toEqual({ ok: true });
    await expect(
      controller.suggestImprovements(request(), {
        strategy_id: 's1',
        backtest_run_id: 'b1',
      }),
    ).resolves.toEqual({ ok: true });

    expect(strategyIntelligence.explainStrategy).toHaveBeenCalledWith(
      'user-1',
      's1',
    );
    expect(backtestIntelligence.suggestImprovements).toHaveBeenCalledWith(
      'user-1',
      's1',
      'b1',
    );
  });
});
