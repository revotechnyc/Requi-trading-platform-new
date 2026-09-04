import { getSnapshot, getIndicators } from "../marketdata/gateway/gateway";
import { resolveSymbolsFromText, routeLayers } from "./symbol-resolver";
import { bundleMeta, bundleToAiBlock, layersForSymbols } from "./normalizer";
import type { IntelligenceBundle, IntelligenceLayer, IntelligenceMeta, LayerEnvelope } from "./types";
import { fetchEdgarFilings } from "./providers/edgar";
import { fetchNews } from "./providers/news";
import { fetchGdeltForSymbol, fetchGdeltMacro } from "./providers/gdelt";
import { fetchEarnings } from "./providers/earnings";
import { fetchSentiment } from "./providers/sentiment";
import { listWatchlistSymbols } from "./watchlist";

async function fetchPriceLayer(userId: string, symbol: string): Promise<LayerEnvelope> {
  const now = new Date().toISOString();
  const snap = await getSnapshot(userId, symbol);
  if (!snap.market_data_available) {
    return {
      layer: "prices",
      ticker: symbol,
      timestamp: now,
      source: "RTI Market Data Gateway",
      available: false,
      stale: false,
      payload: null,
      error: snap.reason ?? "unavailable",
    };
  }
  return {
    layer: "prices",
    ticker: symbol,
    timestamp: snap.timestamp,
    source: snap.source_name,
    available: true,
    stale: snap.stale,
    payload: {
      price: snap.price,
      open: snap.open,
      high: snap.high,
      low: snap.low,
      previous_close: snap.previous_close,
      volume: snap.volume,
      market_session: snap.market_session,
      freshness: snap.freshness,
    },
  };
}

async function fetchIndicatorLayer(userId: string, symbol: string): Promise<LayerEnvelope> {
  const now = new Date().toISOString();
  const ind = await getIndicators(userId, symbol);
  if (!ind.available || !ind.indicators) {
    return {
      layer: "indicators",
      ticker: symbol,
      timestamp: now,
      source: "RTI Indicator Engine",
      available: false,
      stale: false,
      payload: null,
      error: "indicators unavailable",
    };
  }
  return {
    layer: "indicators",
    ticker: symbol,
    timestamp: now,
    source: ind.source ?? "gateway",
    available: true,
    stale: false,
    payload: ind.indicators,
  };
}

async function fetchLayerJob(
  userId: string,
  layer: IntelligenceLayer,
  symbol: string | null,
): Promise<LayerEnvelope> {
  if (!symbol && layer !== "gdelt") {
    return {
      layer,
      ticker: null,
      timestamp: new Date().toISOString(),
      source: layer,
      available: false,
      stale: false,
      payload: null,
      error: "no symbol",
    };
  }
  const sym = symbol!;
  switch (layer) {
    case "prices":
      return fetchPriceLayer(userId, sym);
    case "indicators":
      return fetchIndicatorLayer(userId, sym);
    case "edgar":
      return fetchEdgarFilings(sym);
    case "news":
      return fetchNews(sym);
    case "earnings":
      return fetchEarnings(sym);
    case "sentiment":
      return fetchSentiment(sym);
    case "gdelt":
      return symbol ? fetchGdeltForSymbol(symbol) : fetchGdeltMacro();
    default:
      return {
        layer,
        ticker: symbol,
        timestamp: new Date().toISOString(),
        source: layer,
        available: false,
        stale: false,
        payload: null,
        error: "unknown layer",
      };
  }
}

/**
 * Engine B — query-time intelligence bundle (PDF §5).
 * Routes layers, checks cache via providers, parallel fetch, normalized JSON.
 */
export async function buildIntelligenceBundle(
  userId: string,
  text: string,
  extraSymbols: string[] = [],
  opts?: { includeWatchlist?: boolean },
): Promise<{ bundle: IntelligenceBundle; block: string; meta: IntelligenceMeta }> {
  const watchlist =
    opts?.includeWatchlist === true
      ? await listWatchlistSymbols(userId).catch(() => [] as string[])
      : [];
  const symbols = resolveSymbolsFromText(text, [...extraSymbols, ...watchlist]);
  const { layers: routed } = routeLayers(text, symbols);

  const jobs = layersForSymbols(routed.length ? routed : (symbols.length ? ["prices", "indicators"] as IntelligenceLayer[] : []), symbols);

  const layerResults = await Promise.all(jobs.map((j) => fetchLayerJob(userId, j.layer, j.symbol)));

  const bundle: IntelligenceBundle = {
    query: text,
    symbols,
    layers_routed: routed.length ? routed : symbols.length ? (["prices", "indicators"] as IntelligenceLayer[]) : [],
    fetched_at: new Date().toISOString(),
    layers: layerResults,
  };

  return {
    bundle,
    block: bundleToAiBlock(bundle),
    meta: bundleMeta(bundle),
  };
}

/** Background prefetch for a watchlist symbol across all layers. */
export async function prefetchSymbolLayers(userId: string, symbol: string): Promise<void> {
  const layers: IntelligenceLayer[] = ["prices", "indicators", "news", "sentiment", "edgar", "earnings"];
  await Promise.allSettled(layers.map((layer) => fetchLayerJob(userId, layer, symbol)));
}
