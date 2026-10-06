import { LiveMarketDataProvider } from './live.provider';
import { PermanentProviderError } from './circuit-breaker';
import type { AppConfigService } from '../../config/app-config.service';
const provider = () =>
  new LiveMarketDataProvider({
    vendor: { key: 'test-only-key', secret: 'test-only-secret', feed: 'iex' },
  } as AppConfigService);
const bar = { t: '2026-09-01T00:00:00Z', o: 100, h: 110, l: 90, c: 105, v: 10 };
describe('licensed vendor adapter contract', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses fixed HTTPS endpoints, bounded pagination, and normalizes equities and crypto', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ bars: { AAPL: [bar] }, next_page_token: 'next' }),
      )
      .mockResolvedValueOnce(Response.json({ bars: { AAPL: [bar] } }));
    expect(await provider().fetchEquityDaily(1, 'AAPL')).toHaveLength(1);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.origin).toBe('https://data.alpaca.markets');
    expect(url.searchParams.get('adjustment')).toBe('all');
    expect(url.searchParams.get('feed')).toBe('iex');
    expect((fetchMock.mock.calls[1][0] as URL).toString()).toContain(
      'page_token=next',
    );
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ bars: { 'BTC/USD': [bar] } })),
    );
    expect((await provider().fetchCryptoDaily(4, 'BTC-USD'))[0].provider).toBe(
      'alpaca',
    );
    expect(
      (await provider().fetchCryptoHourly(4, 'BTC-USD'))[0].timestamp,
    ).toEqual(new Date(bar.t));
  });
  it('does not substitute prices after upstream errors or malformed data', async () => {
    const spy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 401 }));
    await expect(provider().fetchEquityDaily(1, 'AAPL')).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
    spy.mockResolvedValue(new Response('', { status: 429 }));
    await expect(provider().fetchEquityDaily(1, 'AAPL')).rejects.toThrow('429');
    spy.mockRejectedValue(new Error('secret upstream url'));
    await expect(provider().fetchEquityDaily(1, 'AAPL')).rejects.toThrow(
      'Market-data network request failed',
    );
    spy.mockResolvedValue(
      Response.json({ bars: { AAPL: [{ ...bar, h: 50 }] } }),
    );
    await expect(provider().fetchEquityDaily(1, 'AAPL')).rejects.toBeInstanceOf(
      PermanentProviderError,
    );
    spy.mockImplementation(() =>
      Promise.resolve(
        Response.json({ bars: { AAPL: [bar] }, next_page_token: 'repeat' }),
      ),
    );
    await expect(provider().fetchEquityDaily(1, 'AAPL')).rejects.toThrow(
      'pagination',
    );
  });
  it('filters incomplete/future candles and rejects misaligned hourly data', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        bars: {
          'BTC/USD': [
            { ...bar, t: new Date(Date.now() + 86400000).toISOString() },
          ],
        },
      }),
    );
    expect(await provider().fetchCryptoDaily(4, 'BTC-USD')).toEqual([]);
    spy.mockResolvedValue(
      Response.json({
        bars: { 'BTC/USD': [{ ...bar, t: '2026-09-01T00:30:00Z' }] },
      }),
    );
    await expect(provider().fetchCryptoHourly(4, 'BTC-USD')).rejects.toThrow(
      'hourly timestamp',
    );
  });
});
