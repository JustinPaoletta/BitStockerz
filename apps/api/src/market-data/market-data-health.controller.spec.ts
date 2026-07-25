import { MarketDataHealthController } from './market-data-health.controller';
import type { MarketDataService } from './market-data.service';

describe('MarketDataHealthController', () => {
  it('delegates to MarketDataService.getMarketDataHealth', async () => {
    const health = { status: 'degraded', source: 'seed' };
    const marketDataService = {
      getMarketDataHealth: jest.fn().mockResolvedValue(health),
    } as unknown as MarketDataService;

    const controller = new MarketDataHealthController(marketDataService);
    await expect(controller.getHealth()).resolves.toEqual(health);
    expect(marketDataService.getMarketDataHealth).toHaveBeenCalled();
  });
});
