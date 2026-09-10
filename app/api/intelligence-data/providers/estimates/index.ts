import { getDataProviderMode } from "../mode";
import { HttpEstimatesProvider } from "./http";
import { MockEstimatesProvider } from "./mock";
import type { EstimateRevisionSnapshot, EstimatesProvider } from "./types";

export type { EstimateRevisionSnapshot, EstimatesProvider } from "./types";

let cached: EstimatesProvider | null = null;

export function getEstimatesProvider(): EstimatesProvider {
  if (cached) return cached;
  // Mock fixtures only when explicitly in mock mode.
  // Live mode always uses HTTP provider (returns unavailable if key missing/DUMMY).
  if (getDataProviderMode() === "mock") {
    cached = new MockEstimatesProvider();
  } else {
    cached = new HttpEstimatesProvider();
  }
  return cached;
}

/** Test helper — clear singleton between mode flips. */
export function resetEstimatesProviderForTests() {
  cached = null;
}

export async function fetchEstimateRevisions(symbol: string): Promise<EstimateRevisionSnapshot> {
  return getEstimatesProvider().getRevisionSnapshot(symbol);
}

export async function fetchEstimatePeers(symbol: string) {
  const p = getEstimatesProvider();
  if (p.getPeers) return p.getPeers(symbol);
  return { available: false, peers: [] as string[], mock: false, source: "estimates", error: "peers not supported" };
}

export function formatRevisionBrief(snap: EstimateRevisionSnapshot): string {
  if (!snap.available) return snap.error ?? "unavailable";
  const bits = [
    snap.epsRevisionPct30d != null ? `EPS 30d ${snap.epsRevisionPct30d >= 0 ? "+" : ""}${snap.epsRevisionPct30d.toFixed(2)}%` : null,
    snap.epsRevisionPct60d != null ? `60d ${snap.epsRevisionPct60d >= 0 ? "+" : ""}${snap.epsRevisionPct60d.toFixed(2)}%` : null,
    snap.epsRevisionPct90d != null ? `90d ${snap.epsRevisionPct90d >= 0 ? "+" : ""}${snap.epsRevisionPct90d.toFixed(2)}%` : null,
  ].filter(Boolean);
  return bits.join("; ") || "revision fields empty";
}
