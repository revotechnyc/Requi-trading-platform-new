/**
 * Intelligence Data Layers — unified normalized schema (PDF §7 item 11).
 * The AI consumes ONLY this bundle; raw provider payloads never reach the model.
 */

export type IntelligenceLayer =
  | "prices"
  | "indicators"
  | "edgar"
  | "news"
  | "gdelt"
  | "earnings"
  | "sentiment";

export interface LayerEnvelope<T = unknown> {
  layer: IntelligenceLayer;
  ticker: string | null;
  timestamp: string;
  source: string;
  available: boolean;
  stale: boolean;
  payload: T | null;
  error?: string;
}

export interface FilingPayload {
  form: string;
  filedAt: string;
  title: string;
  url: string;
}

export interface NewsPayload {
  headlines: Array<{ title: string; source: string; publishedAt: string; url: string }>;
}

export interface GdeltPayload {
  events: Array<{ title: string; url: string; tone: number | null; publishedAt: string }>;
}

export interface EarningsPayload {
  symbol: string;
  reportDate: string | null;
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  surprise: "beat" | "met" | "miss" | "unknown";
  /** confirmed = Finnhub/calendar with consensus; estimated = Yahoo interim */
  dateType?: "confirmed" | "estimated";
  /** Before market open / after market close when known */
  reportTime?: "BMO" | "AMC" | "DMH" | "unknown";
  note?: string;
}

export interface SentimentPayload {
  mentionCount: number;
  samplePosts: Array<{ title: string; url: string; subreddit: string }>;
  tone: "bullish" | "bearish" | "mixed" | "neutral";
}

export interface IntelligenceBundle {
  query: string;
  symbols: string[];
  layers_routed: IntelligenceLayer[];
  fetched_at: string;
  layers: LayerEnvelope[];
}

export interface IntelligenceMeta {
  symbols: string[];
  layers: IntelligenceLayer[];
  sources: string[];
  stale: boolean;
  timestamp: string | null;
}
