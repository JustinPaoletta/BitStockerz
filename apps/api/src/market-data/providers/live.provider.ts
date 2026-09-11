import { Injectable } from '@nestjs/common';
import { PermanentProviderError } from './circuit-breaker';
import type {
  MarketDataProvider,
  ProviderDailyBar,
  ProviderHourlyBar,
} from './market-data-provider';

/**
 * Skeleton live adapter. Wire a real vendor here when MARKET_DATA_LIVE_ENABLED
 * is true and credentials exist. Until then, calls fail permanently so the
 * circuit breaker is not tripped by misconfiguration.
 */
@Injectable()
export class LiveMarketDataProvider implements MarketDataProvider {
  readonly name = 'live';

  fetchEquityDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    void symbolId;
    void symbol;
    return Promise.reject(
      new PermanentProviderError(
        'live equity provider is not configured; plug vendor adapter here',
      ),
    );
  }

  fetchCryptoDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    void symbolId;
    void symbol;
    return Promise.reject(
      new PermanentProviderError(
        'live crypto daily provider is not configured; plug vendor adapter here',
      ),
    );
  }

  fetchCryptoHourly(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderHourlyBar[]> {
    void symbolId;
    void symbol;
    return Promise.reject(
      new PermanentProviderError(
        'live crypto hourly provider is not configured; plug vendor adapter here',
      ),
    );
  }
}
