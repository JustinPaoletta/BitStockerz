import { Injectable } from '@nestjs/common';
import {
  SEED_CRYPTO_DAILY_BARS,
  SEED_CRYPTO_HOURLY_BARS,
  SEED_EQUITY_DAILY_BARS,
} from '../seed-candles';
import type {
  MarketDataProvider,
  ProviderDailyBar,
  ProviderHourlyBar,
} from './market-data-provider';

@Injectable()
export class SeedMarketDataProvider implements MarketDataProvider {
  readonly name = 'seed';

  fetchEquityDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    void symbol;
    return Promise.resolve(
      SEED_EQUITY_DAILY_BARS.filter((bar) => bar.symbolId === symbolId).map(
        (bar) => ({ ...bar }),
      ),
    );
  }

  fetchCryptoDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]> {
    void symbol;
    return Promise.resolve(
      SEED_CRYPTO_DAILY_BARS.filter((bar) => bar.symbolId === symbolId).map(
        (bar) => ({ ...bar }),
      ),
    );
  }

  fetchCryptoHourly(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderHourlyBar[]> {
    void symbol;
    return Promise.resolve(
      SEED_CRYPTO_HOURLY_BARS.filter((bar) => bar.symbolId === symbolId).map(
        (bar) => ({ ...bar }),
      ),
    );
  }
}
