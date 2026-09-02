import type { IntelligenceBundle, IntelligenceLayer, IntelligenceMeta, LayerEnvelope } from "./types";

interface PricePayload {
  price: number;
  previous_close?: number | null;
  market_session?: string | null;
  freshness?: string | null;
}

function formatPriceSummary(layer: LayerEnvelope): string | null {
  if (layer.layer !== "prices" || !layer.available || !layer.payload) return null;
  const payload = layer.payload as PricePayload;
  if (typeof payload.price !== "number" || !(payload.price > 0)) return null;

  const sym = layer.ticker ?? "SYMBOL";
  const parts = [
    `LAST PRICE ${sym}: $${payload.price.toFixed(2)}`,
    `source=${layer.source}`,
    `as_of=${layer.timestamp}`,
  ];
  if (payload.market_session) parts.push(`session=${payload.market_session}`);
  if (typeof payload.previous_close === "number" && payload.previous_close > 0) {
    const change = payload.price - payload.previous_close;
    const pct = (change / payload.previous_close) * 100;
    const sign = change >= 0 ? "+" : "";
    parts.push(`daily_change=${sign}${change.toFixed(2)} (${sign}${pct.toFixed(2)}%)`);
  }
  if (payload.freshness) parts.push(`freshness=${payload.freshness}`);
  if (layer.stale) parts.push("stale=true");
  return parts.join(" | ");
}

export function bundleToAiBlock(bundle: IntelligenceBundle): string {
  const priceSummaries = bundle.layers
    .filter((l) => l.layer === "prices")
    .map((layer) => formatPriceSummary(layer))
    .filter((line): line is string => Boolean(line));

  const lines: string[] = [
    "=== VERIFIED INTELLIGENCE DATA (RTI Data Layers — AUTHORITATIVE) ===",
    "All numbers, dates, filings, headlines, and events below are provider-verified.",
    "Use ONLY these values. Never invent prices, EPS, dates, or headlines.",
    "If a layer is unavailable or payload is null, say so explicitly — do not fill gaps.",
    "For any LAST PRICE line below, repeat that exact dollar amount in your answer — never substitute training-data prices.",
  ];

  if (priceSummaries.length > 0) {
    lines.push("", "AUTHORITATIVE PRICE LINES (copy these exact numbers):", ...priceSummaries);
  }

  lines.push("", JSON.stringify(bundle, null, 0));
  return lines.join("\n");
}

export function bundleMeta(bundle: IntelligenceBundle): IntelligenceMeta {
  const priceLayer = bundle.layers.find((l) => l.layer === "prices" && l.available);
  return {
    symbols: bundle.symbols,
    layers: bundle.layers_routed,
    sources: [...new Set(bundle.layers.filter((l) => l.available).map((l) => l.source))],
    stale: bundle.layers.some((l) => l.stale),
    timestamp: priceLayer?.timestamp ?? bundle.fetched_at,
  };
}

export function mergeLayers(existing: LayerEnvelope[], incoming: LayerEnvelope[]): LayerEnvelope[] {
  const map = new Map<string, LayerEnvelope>();
  for (const l of existing) map.set(`${l.layer}:${l.ticker ?? "_"}`, l);
  for (const l of incoming) map.set(`${l.layer}:${l.ticker ?? "_"}`, l);
  return [...map.values()];
}

export function layersForSymbols(
  routed: IntelligenceLayer[],
  symbols: string[],
): Array<{ layer: IntelligenceLayer; symbol: string | null }> {
  const jobs: Array<{ layer: IntelligenceLayer; symbol: string | null }> = [];
  for (const layer of routed) {
    if (layer === "gdelt") {
      jobs.push({ layer, symbol: null });
      continue;
    }
    if (symbols.length === 0) continue;
    for (const sym of symbols) jobs.push({ layer, symbol: sym });
  }
  return jobs;
}
