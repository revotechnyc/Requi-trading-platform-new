import type { EstimateRevisionSnapshot, EstimatesProvider } from "./types";
import { researchOk } from "../types-research";

const FIXTURES: Record<string, Omit<EstimateRevisionSnapshot, keyof ReturnType<typeof researchOk> | "symbol" | "vendor" | "error">> = {
  AAPL: {
    consensusEps: 1.65,
    consensusRevenue: 94_000_000_000,
    epsRevisionPct30d: 1.2,
    epsRevisionPct60d: 2.4,
    epsRevisionPct90d: 3.1,
    revenueRevisionPct30d: 0.4,
    revenueRevisionPct60d: 0.8,
    revenueRevisionPct90d: 1.1,
    epsDispersion: 0.08,
    asOf: "2026-09-01T00:00:00.000Z",
    peers: ["MSFT", "GOOGL", "AMZN"],
  },
  MSFT: {
    consensusEps: 3.1,
    consensusRevenue: 70_000_000_000,
    epsRevisionPct30d: 0.9,
    epsRevisionPct60d: 1.5,
    epsRevisionPct90d: 2.0,
    revenueRevisionPct30d: 0.5,
    revenueRevisionPct60d: 0.7,
    revenueRevisionPct90d: 1.0,
    epsDispersion: 0.06,
    asOf: "2026-09-01T00:00:00.000Z",
    peers: ["AAPL", "GOOGL", "ORCL"],
  },
  PLUR: {
    consensusEps: -0.67,
    consensusRevenue: 1_200_000,
    epsRevisionPct30d: -2.0,
    epsRevisionPct60d: -1.0,
    epsRevisionPct90d: 0.5,
    revenueRevisionPct30d: null,
    revenueRevisionPct60d: null,
    revenueRevisionPct90d: null,
    epsDispersion: 0.2,
    asOf: "2026-09-01T00:00:00.000Z",
    peers: ["RZLT"],
  },
};

function generic(symbol: string): EstimateRevisionSnapshot {
  const base = researchOk("EstimatesVendor", true);
  return {
    ...base,
    symbol,
    vendor: "MOCK",
    consensusEps: 1.0,
    consensusRevenue: 500_000_000,
    epsRevisionPct30d: 0.5,
    epsRevisionPct60d: 1.0,
    epsRevisionPct90d: 1.5,
    revenueRevisionPct30d: 0.2,
    revenueRevisionPct60d: 0.4,
    revenueRevisionPct90d: 0.6,
    epsDispersion: 0.1,
    asOf: new Date().toISOString(),
    peers: [],
  };
}

export class MockEstimatesProvider implements EstimatesProvider {
  async getRevisionSnapshot(symbol: string): Promise<EstimateRevisionSnapshot> {
    const sym = symbol.toUpperCase();
    const fix = FIXTURES[sym];
    const base = researchOk("EstimatesVendor", true);
    if (!fix) return generic(sym);
    return {
      ...base,
      symbol: sym,
      vendor: "MOCK",
      ...fix,
    };
  }

  async getPeers(symbol: string) {
    const snap = await this.getRevisionSnapshot(symbol);
    return {
      available: true,
      peers: snap.peers ?? [],
      mock: true,
      source: "MOCK/EstimatesVendor peers",
    };
  }
}
