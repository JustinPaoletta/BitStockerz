export type SanityIssueCode =
  | 'HIGH_LT_LOW'
  | 'HIGH_LT_BODY'
  | 'LOW_GT_BODY'
  | 'NON_POSITIVE_PRICE'
  | 'NEGATIVE_VOLUME'
  | 'NON_FINITE';

export type SanityInterval = '1d' | '1h';

export interface SanityBarInput {
  symbol: string;
  interval: SanityInterval;
  date?: string;
  timestamp?: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SanityIssue {
  symbol: string;
  interval: SanityInterval;
  date?: string;
  timestamp?: string;
  code: SanityIssueCode;
  message: string;
}

export interface SanitySummary {
  checked: number;
  invalid: number;
  issues: SanityIssue[];
}
