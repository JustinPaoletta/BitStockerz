import type {
  StrategyDefinition,
  StrategyDefinitionValidationError,
} from './definition/strategy-definition.types';

export const STRATEGY_ASSET_TYPES = ['EQUITY', 'CRYPTO'] as const;
export const STRATEGY_TIMEFRAMES = ['1d', '1h'] as const;
export const STRATEGY_SYMBOL_SCOPES = ['SINGLE'] as const;

export type StrategyAssetType = (typeof STRATEGY_ASSET_TYPES)[number];
export type StrategyTimeframe = (typeof STRATEGY_TIMEFRAMES)[number];
export type StrategySymbolScope = (typeof STRATEGY_SYMBOL_SCOPES)[number];
export type {
  StrategyDefinition,
  StrategyDefinitionValidationError,
} from './definition/strategy-definition.types';

export interface CreateStrategyInput {
  name: string;
  description?: string;
  asset_type: StrategyAssetType;
  timeframe: StrategyTimeframe;
  symbol_scope?: StrategySymbolScope;
  definition: StrategyDefinition;
}

export interface UpdateStrategyInput {
  name?: string;
  description?: string | null;
  asset_type?: StrategyAssetType;
  timeframe?: StrategyTimeframe;
  definition?: StrategyDefinition;
}

export interface ValidateStrategyInput {
  definition?: unknown;
  strategy_id?: string;
}

export interface StrategyVersionRecord {
  versionNumber: number;
  definition: StrategyDefinition;
  createdAt: Date;
}

export interface StrategyRecord {
  id: string;
  userId: string;
  name: string;
  description?: string;
  assetType: StrategyAssetType;
  symbolScope: StrategySymbolScope;
  timeframe: StrategyTimeframe;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  versions: StrategyVersionRecord[];
}

export interface StrategyResponse {
  id: string;
  name: string;
  description: string | null;
  asset_type: StrategyAssetType;
  symbol_scope: StrategySymbolScope;
  timeframe: StrategyTimeframe;
  is_active: boolean;
  version_number: number;
  definition: StrategyDefinition;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface HistoricalStrategyResponse extends StrategyResponse {
  version_created_at: string;
  is_latest: boolean;
}

export interface StrategyListItem {
  id: string;
  name: string;
  asset_type: StrategyAssetType;
  timeframe: StrategyTimeframe;
  version_number: number;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface StrategyListResponse {
  items: StrategyListItem[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ValidateStrategyResponse {
  is_valid: boolean;
  errors: StrategyDefinitionValidationError[];
  summary: string | null;
}
