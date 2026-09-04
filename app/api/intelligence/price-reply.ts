import { buildIntelligenceBundle } from "../intelligence-data/gateway";
import { bundleMeta } from "../intelligence-data/normalizer";
import type { IntelligenceBundle, LayerEnvelope } from "../intelligence-data/types";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import type { MarketMeta } from "./tools";

interface PricePayload {
  price: number;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  previous_close?: number | null;
  volume?: number | null;
  market_session?: string | null;
  freshness?: string | null;
}

const PRICE_INTENT_RE =
  /\b(prices?|quote|trading at|worth|how much|stock prices?|share prices?|current price|trading for|last price|side by side|what is .+ trading)\b/i;

const COMPARE_PRICE_RE =
  /\b(compare|vs\.?|versus)\b/i;

const NON_PRICE_PRIMARY_RE =
  /\b(news|headline|filing|10-?k|10-?q|8-?k|sec\b|edgar|earnings|eps|revenue|sentiment|reddit|wsb|macro|geopolitical|fed\b|inflation)\b/i;

const INDICATOR_ONLY_RE =
  /\b(rsi|macd|vwap|bollinger|ema|sma|atr|indicator|technical analysis|overbought|oversold)\b/i;

const MOVEMENT_NARRATIVE_RE =
  /\b(why is|why are|why did|what caused|what's driving|what is driving|moving today|up today|down today)\b/i;

export function isDeterministicPriceQuery(text: string, symbols: string[]): boolean {
  if (symbols.length === 0) return false;
  if (MOVEMENT_NARRATIVE_RE.test(text)) return false;
  if (INDICATOR_ONLY_RE.test(text) && !PRICE_INTENT_RE.test(text)) return false;

  const wantsCompare = COMPARE_PRICE_RE.test(text) && symbols.length >= 2;
  const wantsPrice = PRICE_INTENT_RE.test(text);

  // "Compare social sentiment..." must not be treated as a price query.
  if (NON_PRICE_PRIMARY_RE.test(text) && !wantsPrice) return false;
  if (!wantsPrice && !wantsCompare) return false;
  return true;
}

function fmtMoney(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUtc(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

function sessionLabel(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  const map: Record<string, string> = {
    REGULAR: "Regular",
    PRE: "Pre-market",
    POST: "After-hours",
    CLOSED: "Closed",
  };
  return map[raw.toUpperCase()] ?? raw;
}

function dailyChange(payload: PricePayload): { abs: number; pct: number } | null {
  if (typeof payload.previous_close !== "number" || payload.previous_close <= 0) return null;
  const abs = payload.price - payload.previous_close;
  const pct = (abs / payload.previous_close) * 100;
  return { abs, pct };
}

function formatChangeLine(payload: PricePayload): string | null {
  const change = dailyChange(payload);
  if (!change) return null;
  const sign = change.abs >= 0 ? "+" : "";
  return `${sign}${fmtMoney(change.abs)} (${sign}${change.pct.toFixed(2)}%)`;
}

export function formatPriceLayerReply(layer: LayerEnvelope): string | null {
  if (layer.layer !== "prices" || !layer.available || !layer.payload) return null;
  const payload = layer.payload as PricePayload;
  if (typeof payload.price !== "number" || !(payload.price > 0)) return null;

  const sym = layer.ticker ?? "Symbol";
  const lines = [
    `**${sym}** is trading at **${fmtMoney(payload.price)}**.`,
    "",
    `- **Session:** ${sessionLabel(payload.market_session)}`,
    `- **As of:** ${fmtUtc(layer.timestamp)}`,
  ];

  const changeLine = formatChangeLine(payload);
  if (changeLine) lines.push(`- **Daily change:** ${changeLine}`);
  lines.push(`- **Source:** ${layer.source} (verified market data)`);
  if (layer.stale || payload.freshness === "STALE") {
    lines.push("- **Note:** Quote is stale — treat as indicative only.");
  }
  return lines.join("\n");
}

export function formatVerifiedPriceReply(bundle: IntelligenceBundle, onlySymbols?: string[]): string {
  const allowed = onlySymbols?.length ? new Set(onlySymbols.map((s) => s.toUpperCase())) : null;
  const priceLayers = bundle.layers.filter((l) => l.layer === "prices");
  const available = priceLayers.filter(
    (l) => l.available && l.payload && (!allowed || (l.ticker && allowed.has(l.ticker))),
  );
  const unavailable = priceLayers.filter(
    (l) => !l.available && (!allowed || (l.ticker && allowed.has(l.ticker))),
  );

  if (available.length === 0) {
    const symbols = (onlySymbols?.length ? onlySymbols : bundle.symbols).join(", ") || "that symbol";
    const reason = unavailable[0]?.error ?? "No verified quote is available right now.";
    return `I don't have a verified market snapshot for **${symbols}**.\n\n${reason}\n\nI won't estimate or invent a price.`;
  }

  const blocks = available
    .map((layer) => formatPriceLayerReply(layer))
    .filter((block): block is string => Boolean(block));

  if (blocks.length === 1) return blocks[0];
  return blocks.join("\n\n");
}

function toMarketMeta(bundle: IntelligenceBundle): MarketMeta {
  const meta = bundleMeta(bundle);
  const priceLayer = bundle.layers.find((l) => l.layer === "prices" && l.available);
  return {
    symbols: meta.symbols,
    source: priceLayer?.source?.toLowerCase() ?? meta.sources[0]?.toLowerCase() ?? null,
    sourceName: priceLayer?.source ?? meta.sources[0] ?? null,
    stale: meta.stale,
    timestamp: meta.timestamp,
  };
}

export interface DeterministicPriceResult {
  reply: string;
  meta: MarketMeta;
}

/** Server-side quote formatter — bypasses the LLM so prices cannot be invented. */
export async function tryDeterministicPriceReply(
  userId: string,
  text: string,
): Promise<DeterministicPriceResult | null> {
  const querySymbols = resolveSymbolsFromText(text);
  if (!isDeterministicPriceQuery(text, querySymbols)) return null;

  const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });
  const symbols = resolveSymbolsFromText(text);
  if (!isDeterministicPriceQuery(text, symbols)) return null;

  return {
    reply: formatVerifiedPriceReply(bundle, symbols),
    meta: toMarketMeta(bundle),
  };
}
