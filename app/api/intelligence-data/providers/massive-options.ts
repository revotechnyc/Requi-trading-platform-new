/**
 * Massive/Polygon Options — IV / implied move.
 * Mock fixtures when DATA_PROVIDER_MODE=mock or MASSIVE_API_KEY=DUMMY.
 */
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import { fetchWithRetry } from "../http";
import { getDataProviderMode, isMockDataMode, resolveApiKey } from "./mode";
import { researchOk, researchUnavailable, type ResearchFetchBase } from "./types-research";

export type ImpliedMoveResult = ResearchFetchBase & {
  symbol: string;
  impliedMovePct: number | null;
  iv: number | null;
  ivRank: number | null;
  expiry: string | null;
  underlyingPrice: number | null;
  detail: string;
};

const MOCK: Record<string, Partial<ImpliedMoveResult>> = {
  AAPL: { impliedMovePct: 4.2, iv: 0.28, ivRank: 42, expiry: "2026-09-19", underlyingPrice: 220 },
  MSFT: { impliedMovePct: 3.5, iv: 0.24, ivRank: 35, expiry: "2026-09-19", underlyingPrice: 420 },
};

function mockImpliedMove(symbol: string): ImpliedMoveResult {
  const sym = symbol.toUpperCase();
  const fix = MOCK[sym] ?? {
    impliedMovePct: 5.0,
    iv: 0.4,
    ivRank: 50,
    expiry: "2026-09-19",
    underlyingPrice: 50,
  };
  return {
    ...researchOk("Massive Options", true),
    symbol: sym,
    impliedMovePct: fix.impliedMovePct ?? null,
    iv: fix.iv ?? null,
    ivRank: fix.ivRank ?? null,
    expiry: fix.expiry ?? null,
    underlyingPrice: fix.underlyingPrice ?? null,
    detail: `ATM implied move ~${fix.impliedMovePct}% (MOCK fixture)`,
  };
}

async function liveImpliedMove(symbol: string, key: string): Promise<ImpliedMoveResult> {
  const sym = symbol.toUpperCase();
  const source = "Massive Options";
  try {
    // Massive/Polygon snapshot endpoint (entitlement-dependent).
    const url = `https://api.massive.com/v3/snapshot/options/${encodeURIComponent(sym)}`;
    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${key}`, "User-Agent": "RequiTrading/1.0" },
      retries: 1,
      timeoutMs: 12_000,
    });
    // Fallback host alias used by Polygon legacy.
    if (res.status === 404) {
      const url2 = `https://api.polygon.io/v3/snapshot/options/${encodeURIComponent(sym)}?apiKey=${encodeURIComponent(key)}`;
      const res2 = await fetchWithRetry(url2, { retries: 1, timeoutMs: 12_000 });
      if (!res2.ok) {
        return {
          ...researchUnavailable(source, `Options snapshot HTTP ${res2.status}`),
          symbol: sym,
          impliedMovePct: null,
          iv: null,
          ivRank: null,
          expiry: null,
          underlyingPrice: null,
          detail: "unavailable",
        };
      }
      // Without contracted field map, refuse to invent implied move.
      return {
        ...researchUnavailable(
          source,
          "Options snapshot returned but implied-move mapping requires live validation against entitlement schema",
        ),
        symbol: sym,
        impliedMovePct: null,
        iv: null,
        ivRank: null,
        expiry: null,
        underlyingPrice: null,
        detail: "mapping pending",
      };
    }
    if (!res.ok) {
      return {
        ...researchUnavailable(source, `Options snapshot HTTP ${res.status}`),
        symbol: sym,
        impliedMovePct: null,
        iv: null,
        ivRank: null,
        expiry: null,
        underlyingPrice: null,
        detail: "unavailable",
      };
    }
    return {
      ...researchUnavailable(
        source,
        "Options snapshot returned but implied-move mapping requires live validation against entitlement schema",
      ),
      symbol: sym,
      impliedMovePct: null,
      iv: null,
      ivRank: null,
      expiry: null,
      underlyingPrice: null,
      detail: "mapping pending",
    };
  } catch (e) {
    return {
      ...researchUnavailable(source, (e as Error).message),
      symbol: sym,
      impliedMovePct: null,
      iv: null,
      ivRank: null,
      expiry: null,
      underlyingPrice: null,
      detail: "error",
    };
  }
}

export async function fetchImpliedMove(
  symbol: string,
  _earningsDate?: string | null,
): Promise<ImpliedMoveResult> {
  const sym = symbol.toUpperCase();
  if (getDataProviderMode() === "mock" || isMockDataMode("MASSIVE_API_KEY")) {
    return mockImpliedMove(sym);
  }
  const key = resolveApiKey("MASSIVE_API_KEY");
  if (!key) {
    return {
      ...researchUnavailable("Massive Options", "MASSIVE_API_KEY not configured or DUMMY"),
      symbol: sym,
      impliedMovePct: null,
      iv: null,
      ivRank: null,
      expiry: null,
      underlyingPrice: null,
      detail: "unavailable",
    };
  }
  return intelligenceCache.through(
    `massive-opt-iv:${sym}`,
    LAYER_TTL_MS.massiveOptions,
    () => liveImpliedMove(sym, key),
  );
}
