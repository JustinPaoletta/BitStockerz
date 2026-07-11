export type AssetType = 'EQUITY' | 'CRYPTO';
export type CandleOrder = 'asc' | 'desc';
export type CryptoInterval = '1d' | '1h';

export interface SymbolRecord {
  id: number;
  symbol: string;
  name: string;
  assetType: AssetType;
  exchange?: string;
  currency: string;
  baseAsset?: string;
  quoteAsset?: string;
  isActive: boolean;
}

export interface SymbolResponse {
  id: number;
  symbol: string;
  name: string;
  asset_type: AssetType;
  exchange?: string;
  currency: string;
  base_asset?: string;
  quote_asset?: string;
  is_active: boolean;
}

export interface SymbolSearchInput {
  q?: string;
  assetType?: AssetType;
  limit?: number;
}

export interface EquityCandlesInput {
  symbol: string;
  start: string;
  end: string;
  limit?: number;
  order?: CandleOrder;
}

export interface CryptoCandlesInput extends EquityCandlesInput {
  interval: CryptoInterval;
}

export interface CandleValues {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DailyCandleResponse extends CandleValues {
  date: string;
}

export type EquityDailyCandleResponse = DailyCandleResponse;

export type CryptoDailyCandleResponse = DailyCandleResponse;

export interface CryptoHourlyCandleResponse extends CandleValues {
  timestamp: string;
}

export type CryptoCandleResponse =
  | CryptoDailyCandleResponse
  | CryptoHourlyCandleResponse;

interface BarRecordBase extends CandleValues {
  symbolId: number;
  provider: string;
}

export interface EquityDailyBarRecord extends BarRecordBase {
  date: Date;
}

export interface CryptoDailyBarRecord extends BarRecordBase {
  date: Date;
}

export interface CryptoHourlyBarRecord extends BarRecordBase {
  timestamp: Date;
}

export type DailyBarRecord = EquityDailyBarRecord | CryptoDailyBarRecord;
export type BarRecord = DailyBarRecord | CryptoHourlyBarRecord;
