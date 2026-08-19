/**
 * RTI Market Data Gateway — shared types.
 *
 * The UnifiedMarketSnapshot is the ONLY market-data shape Intelligence and
 * Autonomous ever see. Providers return raw data; the gateway normalizes,
 * validates, and enriches it. The AI consumes this schema — never raw
 * provider responses.
 */

export type ProviderCode = "BROKER" | "YFINANCE" | "PAPER_EXCHANGE";
export type MarketSession = "PREMARKET" | "REGULAR" | "AFTER_HOURS" | "CLOSED";
export type Freshness = "FRESH" | "AGING" | "STALE";
export type AssetType = "equity" | "etf" | "crypto" | "unknown";

export interface UnifiedMarketSnapshot {
  symbol: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  previous_close: number | null;
  volume: number | null;
  source: ProviderCode;
  source_name: string;
  /** Market-data timestamp from the provider (ISO). */
  timestamp: string;
  /** Server receive timestamp (ISO). */
  received_at: string;
  market_session: MarketSession;
  asset_type: AssetType;
  exchange: string | null;
  is_delayed: boolean;
  stale: boolean;
  freshness: Freshness;
  age_seconds: number;
  validation: ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  stale: boolean;
  age_seconds: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
}

/** Structured failure — never fabricate missing data. */
export interface MarketDataUnavailable {
  market_data_available: false;
  symbol: string;
  broker_attempted: boolean;
  broker_status: "ok" | "failed" | "not_connected" | "unsupported";
  yfinance_attempted: boolean;
  yfinance_status: "ok" | "failed";
  reason: string;
}

export type SnapshotResult =
  | ({ market_data_available: true } & UnifiedMarketSnapshot)
  | MarketDataUnavailable;

export interface OhlcvBar {
  t: number; // epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MarketDataProvider {
  readonly code: ProviderCode;
  readonly sourceName: string;
  /** True when this provider can serve market data for the requesting user. */
  isAvailable(): Promise<boolean>;
  getQuote(symbol: string): Promise<RawQuote>;
  getHistory(symbol: string, period: string, interval: string): Promise<OhlcvBar[]>;
}

export interface RawQuote {
  symbol: string;
  price: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  previousClose?: number | null;
  volume?: number | null;
  timestamp: number | string; // epoch ms or ISO — validation normalizes
  exchange?: string | null;
  isDelayed?: boolean;
}
