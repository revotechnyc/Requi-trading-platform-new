import type { ResearchFetchBase } from "../types-research";

export type EstimateRevisionSnapshot = ResearchFetchBase & {
  symbol: string;
  vendor: string;
  consensusEps: number | null;
  consensusRevenue: number | null;
  /** Percent change in consensus EPS over lookback windows. */
  epsRevisionPct30d: number | null;
  epsRevisionPct60d: number | null;
  epsRevisionPct90d: number | null;
  revenueRevisionPct30d: number | null;
  revenueRevisionPct60d: number | null;
  revenueRevisionPct90d: number | null;
  /** Analyst dispersion / stdev of EPS estimates when vendor provides it. */
  epsDispersion: number | null;
  asOf: string;
  peers?: string[];
};

export interface EstimatesProvider {
  getRevisionSnapshot(symbol: string): Promise<EstimateRevisionSnapshot>;
  getPeers?(symbol: string): Promise<{ available: boolean; peers: string[]; mock: boolean; source: string; error?: string }>;
}
