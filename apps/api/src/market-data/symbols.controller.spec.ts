import { MarketDataService } from './market-data.service';
import { SymbolsController } from './symbols.controller';

describe('SymbolsController', () => {
  it('delegates symbol lookup to the market data service', async () => {
    const lookupSymbol = jest.fn().mockResolvedValue({ symbol: 'AAPL' });
    const marketDataService = {
      lookupSymbol,
    } as unknown as MarketDataService;

    const controller = new SymbolsController(marketDataService);

    await expect(controller.lookup('aapl')).resolves.toEqual({
      symbol: 'AAPL',
    });
    expect(lookupSymbol).toHaveBeenCalledWith('aapl');
  });

  it('maps search query parameters to service input', async () => {
    const searchSymbols = jest.fn().mockResolvedValue([{ symbol: 'BTC-USD' }]);
    const marketDataService = {
      searchSymbols,
    } as unknown as MarketDataService;

    const controller = new SymbolsController(marketDataService);

    await expect(
      controller.search({ q: 'btc', asset_type: 'CRYPTO', limit: 5 }),
    ).resolves.toEqual([{ symbol: 'BTC-USD' }]);
    expect(searchSymbols).toHaveBeenCalledWith({
      q: 'btc',
      assetType: 'CRYPTO',
      limit: 5,
    });
  });
});
