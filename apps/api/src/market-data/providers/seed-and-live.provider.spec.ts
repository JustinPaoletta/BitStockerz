import { PermanentProviderError } from './circuit-breaker';
import { LiveMarketDataProvider } from './live.provider';
import { SeedMarketDataProvider } from './seed.provider';

describe('SeedMarketDataProvider', () => {
  const provider = new SeedMarketDataProvider();

  it('returns equity and crypto seed bars for known symbols', async () => {
    const equity = await provider.fetchEquityDaily(1, 'AAPL');
    const daily = await provider.fetchCryptoDaily(4, 'BTC-USD');
    const hourly = await provider.fetchCryptoHourly(4, 'BTC-USD');

    expect(equity.length).toBeGreaterThan(0);
    expect(daily.length).toBeGreaterThan(0);
    expect(hourly.length).toBeGreaterThan(0);
    expect(provider.name).toBe('seed');
  });
});

describe('LiveMarketDataProvider', () => {
  const provider = new LiveMarketDataProvider();

  it('rejects permanently until a vendor adapter is wired', async () => {
    await expect(provider.fetchEquityDaily(1, 'AAPL')).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
    await expect(provider.fetchCryptoDaily(4, 'BTC-USD')).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
    await expect(
      provider.fetchCryptoHourly(4, 'BTC-USD'),
    ).rejects.toBeInstanceOf(PermanentProviderError);
    expect(provider.name).toBe('live');
  });
});
