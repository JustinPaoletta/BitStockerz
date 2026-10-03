export type ProviderInterval = '1d' | '1h';

export interface ProviderDailyBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  symbolId: number;
}

export interface ProviderHourlyBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  symbolId: number;
}

export interface MarketDataProvider {
  readonly name: string;
  fetchEquityDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]>;
  fetchCryptoDaily(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderDailyBar[]>;
  fetchCryptoHourly(
    symbolId: number,
    symbol: string,
  ): Promise<ProviderHourlyBar[]>;
}
