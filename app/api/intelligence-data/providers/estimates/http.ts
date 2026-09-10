/**
 * HTTP skeleton for FactSet / LSEG / CapIQ estimate revisions.
 * Until a real key is configured in live mode, returns unavailable (no invent).
 */
import { estimatesVendor, resolveApiKey } from "../mode";
import { researchUnavailable } from "../types-research";
import type { EstimateRevisionSnapshot, EstimatesProvider } from "./types";
import { fetchWithRetry } from "../../http";
import { intelligenceCache, LAYER_TTL_MS } from "../../cache";

export class HttpEstimatesProvider implements EstimatesProvider {
  async getRevisionSnapshot(symbol: string): Promise<EstimateRevisionSnapshot> {
    const sym = symbol.toUpperCase();
    const key = resolveApiKey("ESTIMATES_API_KEY");
    const vendor = estimatesVendor();
    const source = `${vendor} estimates API`;

    if (!key) {
      return {
        ...researchUnavailable(source, "ESTIMATES_API_KEY not configured or DUMMY (live mode)"),
        symbol: sym,
        vendor,
        consensusEps: null,
        consensusRevenue: null,
        epsRevisionPct30d: null,
        epsRevisionPct60d: null,
        epsRevisionPct90d: null,
        revenueRevisionPct30d: null,
        revenueRevisionPct60d: null,
        revenueRevisionPct90d: null,
        epsDispersion: null,
        asOf: new Date().toISOString(),
        peers: [],
      };
    }

    return intelligenceCache.through(
      `estimates-rev:${vendor}:${sym}`,
      LAYER_TTL_MS.estimates,
      () => this.fetchLive(sym, key, vendor, source),
    );
  }

  private async fetchLive(
    sym: string,
    key: string,
    vendor: string,
    source: string,
  ): Promise<EstimateRevisionSnapshot> {
    // Vendor-specific endpoints differ; FactSet-shaped placeholder.
    // When wiring a real vendor, map their JSON into EstimateRevisionSnapshot.
    try {
      if (vendor === "factset") {
        // Placeholder URL — real FactSet estimates path requires entitlement + dataset IDs.
        const url = `https://api.factset.com/content/estimates/v1/consensus?ids=${encodeURIComponent(sym)}`;
        const res = await fetchWithRetry(url, {
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
          retries: 1,
          timeoutMs: 15_000,
        });
        if (!res.ok) {
          return {
            ...researchUnavailable(source, `FactSet HTTP ${res.status}`),
            symbol: sym,
            vendor,
            consensusEps: null,
            consensusRevenue: null,
            epsRevisionPct30d: null,
            epsRevisionPct60d: null,
            epsRevisionPct90d: null,
            revenueRevisionPct30d: null,
            revenueRevisionPct60d: null,
            revenueRevisionPct90d: null,
            epsDispersion: null,
            asOf: new Date().toISOString(),
          };
        }
        // Without a contracted schema we refuse to invent mapped fields.
        return {
          ...researchUnavailable(
            source,
            "FactSet response received but field mapping requires contracted schema — contact integration to finalize",
          ),
          symbol: sym,
          vendor,
          consensusEps: null,
          consensusRevenue: null,
          epsRevisionPct30d: null,
          epsRevisionPct60d: null,
          epsRevisionPct90d: null,
          revenueRevisionPct30d: null,
          revenueRevisionPct60d: null,
          revenueRevisionPct90d: null,
          epsDispersion: null,
          asOf: new Date().toISOString(),
        };
      }

      return {
        ...researchUnavailable(
          source,
          `${vendor} live client not fully mapped yet — set DATA_PROVIDER_MODE=mock or complete vendor adapter`,
        ),
        symbol: sym,
        vendor,
        consensusEps: null,
        consensusRevenue: null,
        epsRevisionPct30d: null,
        epsRevisionPct60d: null,
        epsRevisionPct90d: null,
        revenueRevisionPct30d: null,
        revenueRevisionPct60d: null,
        revenueRevisionPct90d: null,
        epsDispersion: null,
        asOf: new Date().toISOString(),
      };
    } catch (e) {
      return {
        ...researchUnavailable(source, (e as Error).message),
        symbol: sym,
        vendor,
        consensusEps: null,
        consensusRevenue: null,
        epsRevisionPct30d: null,
        epsRevisionPct60d: null,
        epsRevisionPct90d: null,
        revenueRevisionPct30d: null,
        revenueRevisionPct60d: null,
        revenueRevisionPct90d: null,
        epsDispersion: null,
        asOf: new Date().toISOString(),
      };
    }
  }

  async getPeers(symbol: string) {
    const snap = await this.getRevisionSnapshot(symbol);
    return {
      available: Boolean(snap.peers?.length),
      peers: snap.peers ?? [],
      mock: false,
      source: snap.source,
      error: snap.error,
    };
  }
}
