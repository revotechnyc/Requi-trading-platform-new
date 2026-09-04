import { buildIntelligenceBundle } from "../intelligence-data/gateway";
import { bundleMeta } from "../intelligence-data/normalizer";
import type { EarningsPayload, IntelligenceBundle, LayerEnvelope, NewsPayload, SentimentPayload } from "../intelligence-data/types";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import type { GatewayIndicators } from "../marketdata/gateway/indicators";
import type { MarketMeta } from "./tools";
import {
  formatVerifiedPriceReply,
  isDeterministicPriceQuery,
  tryDeterministicPriceReply,
  type DeterministicPriceResult,
} from "./price-reply";

const DATA_QUERY_RE =
  /\b(price|prices?|quote|trading|rsi|macd|sma|ema|earnings|filing|filings|sec|edgar|sentiment|news|indicator|overbought|oversold|compare|current|latest|worth|momentum|macro)\b/i;

const RSI_QUERY_RE = /\brsi\b/i;
const OVERBOUGHT_RE = /\boverbought\b/i;
const OVERSOLD_RE = /\boversold\b/i;
const EARNINGS_QUERY_RE = /\b(earnings|report(?:s|ing)?(?:\s+earnings)?|next earnings|earnings date|report next)\b/i;
const MACRO_QUERY_RE = /\b(macro|geopolitical|global news|market today|technology stocks|us equities)\b/i;
const MULTI_INDICATOR_RE = /\b(macd|sma\s*20|sma\s*50|sma\s*200)\b/i;
const FILING_QUERY_RE = /\b(filing|filings|10-?k|10-?q|8-?k|sec\b|edgar|insider)\b/i;
const SPECIFIC_FORM_RE = /\b(10-?K|10-?Q|8-?K)\b/i;
const SENTIMENT_QUERY_RE = /\b(sentiment|reddit|wsb|stocktwits|traders?|social|saying)\b/i;
const NEWS_QUERY_RE = /\b(news|headline|headlines)\b/i;
const PRICE_QUERY_RE = /\b(prices?|quote|trading at|current price|worth)\b/i;
const MOMENTUM_RE = /\bmomentum\b/i;

function countDataIntents(text: string): number {
  let n = 0;
  if (PRICE_QUERY_RE.test(text) || /\bcompare\b/i.test(text)) n++;
  if (RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text) || MOMENTUM_RE.test(text)) n++;
  if (NEWS_QUERY_RE.test(text)) n++;
  if (SENTIMENT_QUERY_RE.test(text)) n++;
  if (EARNINGS_QUERY_RE.test(text)) n++;
  if (FILING_QUERY_RE.test(text)) n++;
  return n;
}

function isCrossFeatureQuery(text: string): boolean {
  return countDataIntents(text) >= 2 && resolveSymbolsFromText(text).length >= 1;
}

function toMarketMeta(bundle: IntelligenceBundle): MarketMeta {
  const meta = bundleMeta(bundle);
  const priceLayer = bundle.layers.find((l) => l.layer === "prices" && l.available);
  const gdeltLayer = bundle.layers.find((l) => l.layer === "gdelt" && l.available);
  return {
    symbols: meta.symbols,
    source: priceLayer?.source?.toLowerCase() ?? gdeltLayer?.source?.toLowerCase() ?? meta.sources[0]?.toLowerCase() ?? null,
    sourceName: priceLayer?.source ?? gdeltLayer?.source ?? meta.sources[0] ?? null,
    stale: meta.stale,
    timestamp: gdeltLayer?.timestamp ?? meta.timestamp,
  };
}

function symbolLayersAvailable(bundle: IntelligenceBundle, symbol: string): boolean {
  return bundle.layers.some((l) => l.ticker === symbol && l.available);
}

function formatUnavailableReply(bundle: IntelligenceBundle): string {
  const symbols = bundle.symbols.length ? bundle.symbols.join(", ") : "that symbol";
  const lines = [
    `I don't have verified market data for **${symbols}**.`,
    "",
    "The following could not be retrieved from our data services:",
  ];

  const checks = [
    { layer: "prices", label: "Current price" },
    { layer: "indicators", label: "RSI / technical indicators" },
    { layer: "earnings", label: "Earnings date" },
    { layer: "edgar", label: "SEC filings" },
    { layer: "sentiment", label: "Social sentiment" },
    { layer: "news", label: "News headlines" },
  ] as const;

  for (const sym of bundle.symbols) {
    for (const check of checks) {
      const layer = bundle.layers.find((l) => l.layer === check.layer && l.ticker === sym);
      if (!layer?.available) {
        lines.push(`- **${check.label} (${sym}):** unavailable${layer?.error ? ` — ${layer.error}` : ""}`);
      }
    }
  }

  lines.push("", "I won't invent or estimate any financial figures. Please verify the ticker symbol.");
  return lines.join("\n");
}

function shouldBlockHallucination(text: string, bundle: IntelligenceBundle): boolean {
  if (!bundle.symbols.length || !DATA_QUERY_RE.test(text)) return false;
  return bundle.symbols.every((sym) => !symbolLayersAvailable(bundle, sym));
}

function formatRsiLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  if (typeof ind.rsi_14 !== "number") return null;
  const sym = layer.ticker ?? "Symbol";
  let tone = "neutral";
  if (ind.rsi_14 >= 70) tone = "overbought";
  else if (ind.rsi_14 <= 30) tone = "oversold";
  return `**${sym} RSI (14):** ${ind.rsi_14.toFixed(2)} — ${tone} zone (0–100 scale)\n- **Source:** ${layer.source}\n- **As of:** ${layer.timestamp}`;
}

function formatIndicatorBundle(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  const sym = layer.ticker ?? "Symbol";
  const parts: string[] = [`**${sym} technical indicators**`, ""];
  if (typeof ind.rsi_14 === "number") parts.push(`- **RSI (14):** ${ind.rsi_14.toFixed(2)}`);
  if (typeof ind.macd === "number") parts.push(`- **MACD:** ${ind.macd.toFixed(4)}`);
  if (typeof ind.macd_signal === "number") parts.push(`- **MACD Signal:** ${ind.macd_signal.toFixed(4)}`);
  if (typeof ind.sma_20 === "number") parts.push(`- **SMA 20:** $${ind.sma_20.toFixed(2)}`);
  if (typeof ind.sma_50 === "number") parts.push(`- **SMA 50:** $${ind.sma_50.toFixed(2)}`);
  if (typeof ind.sma_200 === "number") parts.push(`- **SMA 200:** $${ind.sma_200.toFixed(2)}`);
  parts.push(`- **Source:** ${layer.source} (gateway-computed)`);
  parts.push(`- **As of:** ${layer.timestamp}`);
  return parts.join("\n");
}

function formatOverboughtOversold(layer: LayerEnvelope): string | null {
  if (layer.layer !== "indicators" || !layer.available || !layer.payload) return null;
  const ind = layer.payload as GatewayIndicators;
  if (typeof ind.rsi_14 !== "number") return null;
  const sym = layer.ticker ?? "Symbol";
  let verdict = "neither clearly overbought nor oversold";
  if (ind.rsi_14 >= 70) verdict = "**overbought** (RSI ≥ 70)";
  else if (ind.rsi_14 <= 30) verdict = "**oversold** (RSI ≤ 30)";
  return `**${sym}** is ${verdict}.\n\n- **RSI (14):** ${ind.rsi_14.toFixed(2)}\n- **Source:** ${layer.source}\n- **As of:** ${layer.timestamp}`;
}

function formatEps(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
  if (value && typeof value === "object" && "fmt" in value && typeof (value as { fmt?: unknown }).fmt === "string") {
    return (value as { fmt: string }).fmt;
  }
  if (value && typeof value === "object" && "raw" in value) {
    const raw = (value as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw.toFixed(2);
  }
  return "n/a";
}

function formatEarningsLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "earnings" || !layer.available || !layer.payload) return null;
  const ep = layer.payload as EarningsPayload;
  const sym = layer.ticker ?? ep.symbol;
  const dateLabel = ep.dateType === "confirmed" ? "confirmed" : "estimated";
  const timeLabel = ep.reportTime && ep.reportTime !== "unknown" ? ` (${ep.reportTime})` : "";
  const lines = [
    `**${sym} next earnings:** ${ep.reportDate ?? "unavailable"} — **${dateLabel}**${timeLabel}`,
    `- **EPS estimate:** ${formatEps(ep.epsEstimate)}`,
    `- **Source:** ${layer.source}`,
  ];
  if (ep.note) lines.push(`- **Note:** ${ep.note}`);
  return lines.join("\n");
}

function formatSentimentLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "sentiment") return null;
  const sym = layer.ticker ?? "Symbol";
  if (!layer.available || !layer.payload) {
    return (
      `**${sym} social sentiment:** unavailable\n` +
      `- **Reason:** ${layer.error ?? "no ticker-relevant posts from Reddit RSS or Stocktwits"}\n` +
      `- **As of:** ${layer.timestamp}\n` +
      `I won't invent trader commentary or infer sentiment from price/RSI.`
    );
  }
  const sp = layer.payload as SentimentPayload;
  const samples = sp.samplePosts.slice(0, 4).map((p) => `- ${p.title} (${p.subreddit})`);
  const lines = [
    `**${sym} social sentiment:** **${sp.tone}**`,
    `- **Mentions sampled:** ${sp.mentionCount}`,
    `- **Source:** ${layer.source}`,
    `- **As of:** ${layer.timestamp}`,
  ];
  if (samples.length) {
    lines.push("", "Sample posts:", ...samples);
  }
  if (sp.mentionCount < 8) {
    lines.push("", "Caveat: small sample — weak signal, not a reliable market indicator.");
  }
  return lines.join("\n");
}

interface FilingPayloadItem {
  form: string;
  filedAt: string;
  title: string;
  url: string;
}

function formatEdgarReply(text: string, bundle: IntelligenceBundle): string | null {
  const edgarLayers = bundle.layers.filter((l) => l.layer === "edgar" && l.available && l.payload);
  if (!edgarLayers.length) return null;

  const specificForm = text.match(SPECIFIC_FORM_RE)?.[0]?.toUpperCase().replace(/(\d)([KQ])/i, "$1-$2");
  const blocks: string[] = [];

  for (const layer of edgarLayers) {
    const filings = layer.payload as FilingPayloadItem[];
    if (!filings?.length) continue;
    const sym = layer.ticker ?? "Symbol";

    if (specificForm) {
      const normalized = specificForm.replace("-", "");
      const match = filings.find((f) => {
        const fn = f.form.toUpperCase().replace("-", "").replace(/\/A$/, "");
        return fn === normalized || fn === specificForm.replace("-", "");
      });
      if (match) {
        blocks.push(
          `**${sym}'s latest ${specificForm}**\n` +
          `- **Filed:** ${match.filedAt}\n` +
          `- **Form:** ${match.form}\n` +
          `- **Title:** ${match.title}\n` +
          `- **Source:** SEC EDGAR\n` +
          `- **Verified:** ${layer.timestamp}\n` +
          `- [View on sec.gov](${match.url})`,
        );
      } else {
        const available = filings.slice(0, 3).map((f) => `${f.form} (${f.filedAt})`).join(", ");
        blocks.push(
          `**${sym}'s latest ${specificForm}** is not in the recent EDGAR filings.\n` +
          `Available recent filings: ${available}\n` +
          `- **Source:** SEC EDGAR\n` +
          `- **Verified:** ${layer.timestamp}`,
        );
      }
    } else {
      const lines = [
        `**${sym}'s latest SEC filings**`,
        `Verified via **SEC EDGAR** on ${layer.timestamp}:`,
        "",
      ];
      for (const f of filings.slice(0, 8)) {
        lines.push(`- **${f.form}** — filed ${f.filedAt} — [sec.gov](${f.url})`);
      }
      blocks.push(lines.join("\n"));
    }
  }

  return blocks.length ? blocks.join("\n\n") : null;
}

function formatGdeltReply(bundle: IntelligenceBundle): string | null {
  const gdelt = bundle.layers.find((l) => l.layer === "gdelt");
  if (!gdelt) {
    return [
      "**Macro news (GDELT):** unavailable",
      "- **Reason:** GDELT layer was not routed",
      "I won't invent macro headlines.",
    ].join("\n");
  }
  if (!gdelt.available || !gdelt.payload || !("events" in (gdelt.payload as object))) {
    return [
      "**Macro news (GDELT):** unavailable",
      `- **Reason:** ${gdelt.error ?? "no GDELT events returned"}`,
      `- **As of:** ${gdelt.timestamp}`,
      `- **Source:** ${gdelt.source}`,
      "I won't invent macro headlines.",
    ].join("\n");
  }
  const events = (gdelt.payload as { events: Array<{ title: string; url: string; publishedAt: string }> }).events;
  if (!events.length) {
    return [
      "**Macro news (GDELT):** unavailable",
      "- **Reason:** empty event list",
      `- **As of:** ${gdelt.timestamp}`,
      `- **Source:** ${gdelt.source}`,
      "I won't invent macro headlines.",
    ].join("\n");
  }
  const lines = [
    "**Macro news (GDELT)**",
    "",
    `- **Last refresh:** ${gdelt.timestamp}`,
    `- **Source:** ${gdelt.source}`,
    "",
    ...events.slice(0, 6).map((e, i) => `${i + 1}. ${e.title}`),
  ];
  return lines.join("\n");
}

function formatNewsLine(layer: LayerEnvelope): string | null {
  if (layer.layer !== "news") return null;
  const sym = layer.ticker ?? "Symbol";
  if (!layer.available || !layer.payload) {
    return `**${sym} news:** unavailable${layer.error ? ` — ${layer.error}` : ""}`;
  }
  const news = layer.payload as NewsPayload;
  const heads = news.headlines?.slice(0, 3) ?? [];
  if (!heads.length) return `**${sym} news:** no headlines`;
  return [
    `**${sym} latest news** (source: ${layer.source})`,
    ...heads.map((h, i) => `${i + 1}. ${h.title}`),
  ].join("\n");
}

function formatMomentumCompare(bundle: IntelligenceBundle): string | null {
  const rows: Array<{ sym: string; rsi: number }> = [];
  for (const layer of bundle.layers.filter((l) => l.layer === "indicators" && l.available && l.payload)) {
    const ind = layer.payload as GatewayIndicators;
    if (typeof ind.rsi_14 === "number" && layer.ticker) rows.push({ sym: layer.ticker, rsi: ind.rsi_14 });
  }
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.rsi - a.rsi);
  return (
    `**Momentum (RSI-based):** **${rows[0].sym}** shows stronger short-term momentum ` +
    `(RSI ${rows[0].rsi.toFixed(2)}) vs **${rows[1].sym}** (RSI ${rows[1].rsi.toFixed(2)}). ` +
    `This is indicator-based only — not a trade recommendation.`
  );
}

function formatCrossFeatureReply(text: string, bundle: IntelligenceBundle): string | null {
  const parts: string[] = [];
  const wantsPrice = PRICE_QUERY_RE.test(text) || /\bcompare\b/i.test(text);
  const wantsRsi = RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text) || MOMENTUM_RE.test(text);
  const wantsNews = NEWS_QUERY_RE.test(text);
  const wantsSentiment = SENTIMENT_QUERY_RE.test(text);
  const wantsEarnings = EARNINGS_QUERY_RE.test(text);
  const wantsFilings = FILING_QUERY_RE.test(text);

  if (wantsPrice) {
    const price = formatVerifiedPriceReply(bundle, resolveSymbolsFromText(text));
    if (price) parts.push(price);
  }
  if (wantsRsi) {
    const rsi = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map(formatRsiLine)
      .filter((b): b is string => Boolean(b));
    if (rsi.length) parts.push(rsi.join("\n\n"));
  }
  if (wantsNews) {
    const news = bundle.layers
      .filter((l) => l.layer === "news")
      .map(formatNewsLine)
      .filter((b): b is string => Boolean(b));
    if (news.length) parts.push(news.join("\n\n"));
    else parts.push("**News:** unavailable from configured feeds.");
  }
  if (wantsSentiment) {
    const sent = bundle.layers
      .filter((l) => l.layer === "sentiment")
      .map(formatSentimentLine)
      .filter((b): b is string => Boolean(b));
    if (sent.length) parts.push(sent.join("\n\n"));
  }
  if (wantsEarnings) {
    const earn = bundle.layers
      .filter((l) => l.layer === "earnings")
      .map(formatEarningsLine)
      .filter((b): b is string => Boolean(b));
    if (earn.length) parts.push(earn.join("\n\n"));
  }
  if (wantsFilings) {
    const edgar = formatEdgarReply(text, bundle);
    if (edgar) parts.push(edgar);
  }
  if (MOMENTUM_RE.test(text) || /\bcompare\b/i.test(text)) {
    const mom = formatMomentumCompare(bundle);
    if (mom) parts.push(mom);
  }

  return parts.length ? parts.join("\n\n") : null;
}

function tryFormatFromBundle(text: string, bundle: IntelligenceBundle): string | null {
  if (MACRO_QUERY_RE.test(text) && !bundle.symbols.length) {
    return formatGdeltReply(bundle);
  }

  // Multi-layer compare queries must not short-circuit on "SEC filings" alone.
  if (isCrossFeatureQuery(text)) {
    const cross = formatCrossFeatureReply(text, bundle);
    if (cross) return cross;
  }

  if (FILING_QUERY_RE.test(text)) {
    const edgarReply = formatEdgarReply(text, bundle);
    if (edgarReply) return edgarReply;
  }

  if (EARNINGS_QUERY_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "earnings")
      .map(formatEarningsLine)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (SENTIMENT_QUERY_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "sentiment")
      .map(formatSentimentLine)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (OVERBOUGHT_RE.test(text) || OVERSOLD_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map(formatOverboughtOversold)
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (RSI_QUERY_RE.test(text) || MULTI_INDICATOR_RE.test(text)) {
    const blocks = bundle.layers
      .filter((l) => l.layer === "indicators")
      .map((l) => (MULTI_INDICATOR_RE.test(text) ? formatIndicatorBundle(l) : formatRsiLine(l)))
      .filter((b): b is string => Boolean(b));
    if (blocks.length) return blocks.join("\n\n");
  }

  if (isDeterministicPriceQuery(text, bundle.symbols)) {
    return formatVerifiedPriceReply(bundle, resolveSymbolsFromText(text));
  }

  return null;
}

/** Broader deterministic data path — blocks hallucination and formats verified layers. */
export async function tryDeterministicDataReply(
  userId: string,
  text: string,
): Promise<DeterministicPriceResult | null> {
  if (
    !SENTIMENT_QUERY_RE.test(text) &&
    !FILING_QUERY_RE.test(text) &&
    !EARNINGS_QUERY_RE.test(text) &&
    !MACRO_QUERY_RE.test(text) &&
    !isCrossFeatureQuery(text)
  ) {
    const price = await tryDeterministicPriceReply(userId, text).catch(() => null);
    if (price) return price;
  }

  const symbols = resolveSymbolsFromText(text);
  if (!symbols.length && !MACRO_QUERY_RE.test(text)) return null;

  const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });

  if (shouldBlockHallucination(text, bundle)) {
    return { reply: formatUnavailableReply(bundle), meta: toMarketMeta(bundle) };
  }

  const formatted = tryFormatFromBundle(text, bundle);
  if (formatted) {
    return { reply: formatted, meta: toMarketMeta(bundle) };
  }

  return null;
}
