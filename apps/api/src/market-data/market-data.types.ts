export type AssetType = 'EQUITY' | 'CRYPTO';

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
