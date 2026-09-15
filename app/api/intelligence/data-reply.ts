import { buildIntelligenceBundle } from "../intelligence-data/gateway";
import { bundleMeta } from "../intelligence-data/normalizer";
import type { EarningsPayload, IntelligenceBundle, LayerEnvelope, NewsPayload, SentimentPayload } from "../intelligence-data/types";
import { resolveSymbolsFromText } from "../intelligence-data/symbol-resolver";
import { tryEarningsDayCalendarReply } from "../intelligence-data/earnings-day";
import type { GatewayIndicators } from "../marketdata/gateway/indicators";
import type { MarketMeta } from "./tools";
import {
  formatVerifiedPriceReply,
  isDeterministicPriceQuery,
  isHistoricalPriceQuery,
  tryDeterministicPriceReply,
  type DeterministicPriceResult,
} from "./price-reply";
import {
  isFilingContentQuery,
  isFundamentalSeriesQuery,
  isNlScreenerQuery,
  isRiskRewardQuery,
  isDeskCompareQuery,
  isImpliedMoveQuery,
  isRatesBackdropQuery,
} from "./gap-intents";

export {
  isFilingContentQuery,
  isFundamentalSeriesQuery,
  isNlScreenerQuery,
  isRiskRewardQuery,
  isDeskCompareQuery,
  isImpliedMoveQuery,
  isRatesBackdropQuery,
} from "./gap-intents";
import { fetchImpliedMove } from "../intelligence-data/providers/massive-options";
import { fetchFredMacroBackdrop, formatFredMacroBrief } from "../intelligence-data/providers/fred";
import { tryMarketIntelligenceReply } from "./general-market";

const DATA_QUERY_RE =
  /\b(price|prices?|quote|trading|rsi|macd|sma|ema|earnings|filing|filings|sec|edgar|sentiment|news|indicator|overbought|oversold|compare|current|latest|worth|momentum|macro)\b/i;

const RSI_QUERY_RE = /\brsi\b/i;
const OVERBOUGHT_RE = /\boverbought\b/i;
const OVERSOLD_RE = /\boversold\b/i;
const EARNINGS_QUERY_RE = /\b(earnings|report(?:s|ing)?(?:\s+earnings)?|next earnings|earnings date|report next)\b/i;
const MACRO_QUERY_RE = /\b(macro|geopolitical|global news|technology stocks)\b/i;
const MULTI_INDICATOR_RE = /\b(macd|sma\s*20|sma\s*50|sma\s*200)\b/i;
const FILING_QUERY_RE = /\b(filing|filings|10-?k|10-?q|8-?k|sec\b|edgar|insider)\b/i;
const SPECIFIC_FORM_RE = /\b(10-?K|10-?Q|8-?K)\b/i;
const SENTIMENT_QUERY_RE = /\b(sentiment|reddit|wsb|stocktwits|traders?|social|saying)\b/i;
const NEWS_QUERY_RE = /\b(news|headline|headlines)\b/i;
const PRICE_QUERY_RE = /\b(prices?|quote|trading at|current price|worth)\b/i;
const MOMENTUM_RE = /\bmomentum\b/i;

function gapMeta(symbols: string[], sourceName: string): MarketMeta {
  return {
    symbols,
    source: null,
    sourceName,
    stale: true,
    timestamp: new Date().toISOString(),
  };
}

export function formatNlScreenerUnavailableReply(text: string): string {
  return [
    "**Natural-language stock screener: NOT WIRED**",
    "",
    "I understood this as a *screen* (filters like SMA/RSI/sector), not as ticker symbols.",
    "",
    "I will **not** invent a matching stock list, and I will **not** treat words like ABOVE or SECTOR as tickers.",
    "",
    "Status: **WAIT** — a sector/fundamental/technical screener API is required.",
    "",
    "Until then, ask about specific tickers (e.g. `What is NVDA RSI?`) or use the earnings-day screens that are already connected.",
    "",
    `_Request kept for routing audit:_ ${text.trim().slice(0, 180)}`,
  ].join("\n");
}

export function formatFundamentalSeriesUnavailableReply(symbols: string[]): string {
  const label = symbols.length ? symbols.join(", ") : "the requested names";
  return [
    `**Fundamental time-series: UNAVAILABLE** for **${label}**.`,
    "",
    "I do not yet have a verified multi-quarter margin / valuation history series wired for side-by-side compare.",
    "",
    "Status: **WAIT** — SEC companyfacts history (or a fundamentals vendor time series) is required.",
    "",
    "I will **not** invent 8-quarter gross-margin tables or substitute a live price / filing-link dump for that series.",
    "",
    "Closest available today: latest XBRL point facts inside earnings-candidate research, or latest EDGAR filing links.",
  ].join("\n");
}

export function formatRiskRewardPartialReply(
  text: string,
  bundle: IntelligenceBundle | null,
): string {
  const symbols = resolveSymbolsFromText(text);
  const sym = symbols[0] ?? bundle?.symbols[0] ?? "the symbol";
  const lines = [
    `**Risk/reward framing — ${sym}**`,
    "",
    "Status: **PARTIAL / RESEARCH ONLY** — a full risk/reward card needs levels, implied move, and position constraints that are not all verified here.",
    "",
    "I will **not** collapse this ask into a next-earnings date alone.",
    "",
  ];

  const earn = bundle?.layers.find((l) => l.layer === "earnings" && l.available && l.payload);
  if (earn) {
    const ep = earn.payload as EarningsPayload;
    lines.push(
      "**Supporting earnings calendar (not a trade authorization)**",
      `- Next report: ${ep.reportDate ?? "unavailable"} (${ep.dateType ?? "n/a"})${ep.reportTime && ep.reportTime !== "unknown" ? ` · ${ep.reportTime}` : ""}`,
      `- EPS estimate: ${formatEps(ep.epsEstimate)}`,
      `- Source: ${earn.source}`,
      "",
    );
  }

  const price = bundle?.layers.find((l) => l.layer === "prices" && l.available && l.ticker === sym);
  if (price?.payload && typeof (price.payload as { price?: number }).price === "number") {
    lines.push(
      `**Reference price:** $${((price.payload as { price: number }).price).toFixed(2)} (${price.source})`,
      "",
    );
  }

  lines.push(
    "**Required for a data-backed R/R card (currently WAIT / incomplete)**",
    "1. Verified entry, invalidation (stop), and target levels — or explicit trader-provided levels",
    "2. Options implied move into the event (live IV), when the catalyst is earnings",
    "3. Position size / max loss in account terms",
    "4. Catalyst calendar confirmation (not estimated-only when avoidable)",
    "",
    "Decision: **NO TRADE** from this message alone. Provide levels or run earnings-candidate research for gap registers — still not a BUY authorization.",
  );
  return lines.join("\n");
}

/** Multi-factor desk compare — verified layers only; WAIT where valuation/narrative missing. */
export function formatDeskCompareReply(text: string, bundle: IntelligenceBundle): string {
  const symbols = resolveSymbolsFromText(text);
  const syms = symbols.length ? symbols : bundle.symbols;
  const label = syms.join(" vs ") || "names";
  const lines: string[] = [
    `**Research-desk compare — ${label}**`,
    "",
    "_Verified layers only. Missing factors are marked **WAIT** — nothing invented._",
    "",
  ];

  // Price
  lines.push("### Price (verified)");
  const priceBlock = formatVerifiedPriceReply(bundle, syms);
  lines.push(priceBlock || "Price: **UNAVAILABLE**");
  lines.push("");

  // Momentum
  lines.push("### Momentum");
  const rsiBlocks = bundle.layers
    .filter((l) => l.layer === "indicators" && (!syms.length || (l.ticker && syms.includes(l.ticker))))
    .map(formatRsiLine)
    .filter((b): b is string => Boolean(b));
  if (rsiBlocks.length) {
    lines.push(...rsiBlocks);
    const mom = formatMomentumCompare(bundle);
    if (mom) lines.push("", mom);
  } else {
    lines.push("Momentum / RSI: **WAIT** — indicators layer unavailable for one or more names.");
  }
  lines.push("");

  // Business quality / fundamentals (point facts from earnings research aren't in bundle;
  // use earnings dates + filing list as partial quality signals, WAIT for full quality score.)
  lines.push("### Business quality");
  lines.push(
    "Full business-quality scorecard (segment mix, moat, capital returns): **WAIT** — not wired as a dedicated layer.",
  );
  const earnBlocks = bundle.layers
    .filter((l) => l.layer === "earnings" && (!syms.length || (l.ticker && syms.includes(l.ticker))))
    .map(formatEarningsLine)
    .filter((b): b is string => Boolean(b));
  if (earnBlocks.length) {
    lines.push("", "_Nearest verified proxy — next earnings:_", ...earnBlocks);
  }
  lines.push("");

  // Valuation
  lines.push("### Valuation");
  lines.push(
    "Trailing/forward multiples vs history and peers: **WAIT** — historical valuation series / peer multiples not verified on the free stack.",
  );
  lines.push("I will **not** invent P/E, EV/EBITDA, or “expensive vs cheap” from price alone.");
  lines.push("");

  // Key risks
  lines.push("### Key risks");
  const newsBlocks = bundle.layers
    .filter((l) => l.layer === "news" && l.available && (!syms.length || (l.ticker && syms.includes(l.ticker))))
    .map(formatNewsLine)
    .filter((b): b is string => Boolean(b));
  if (newsBlocks.length) {
    lines.push("_Recent headline context (not a complete risk register):_", ...newsBlocks);
  } else {
    lines.push("News-derived risk context: **UNAVAILABLE** from configured feeds.");
  }
  const edgar = formatEdgarReply(
    // Force metadata list, not content-QA invent path
    `latest SEC filings ${syms.join(" ")}`,
    bundle,
  );
  if (edgar) {
    lines.push("", "_Filing metadata (body text not extracted):_", edgar);
  } else {
    lines.push("", "SEC filing list: **UNAVAILABLE**.");
  }
  lines.push(
    "",
    "Narrative risk factors from 10-K/10-Q text: **WAIT** — full-text extract not wired.",
  );
  lines.push("");

  lines.push("### Bottom line");
  lines.push(
    "This is a **partial** desk card from connected market/data layers only. " +
      "For a full earnings-protocol scorecard (still not a trade authorization), say " +
      `\`Run earnings candidate research on ${syms.join(", ") || "TICKERS"}\`.`,
  );
  lines.push("Status: **RESEARCH ONLY / NO TRADE**.");

  return lines.join("\n");
}

export function formatImpliedMoveReply(
  symbol: string,
  implied: Awaited<ReturnType<typeof fetchImpliedMove>>,
  earningsLine: string | null,
): string {
  const sym = symbol.toUpperCase();
  const lines = [
    `**Implied move — ${sym}**`,
    "",
  ];

  if (implied.available && implied.impliedMovePct != null) {
    lines.push(
      `- **Implied move:** ~${implied.impliedMovePct.toFixed(2)}%` +
        (implied.mock ? " *[MOCK — not live vendor]*" : ""),
      `- **IV:** ${implied.iv != null ? implied.iv : "n/a"}`,
      `- **Expiry:** ${implied.expiry ?? "n/a"}`,
      `- **Source:** ${implied.source}`,
      `- **Detail:** ${implied.detail}`,
      "",
    );
  } else {
    lines.push(
      "Live options implied move: **UNAVAILABLE / WAIT**",
      `- **Reason:** ${implied.error ?? implied.detail ?? "options IV not retrieved"}`,
      `- **Source:** ${implied.source}`,
      "",
      "I will **not** invent an implied move from the earnings date or EPS estimate alone.",
      "",
    );
  }

  if (earningsLine) {
    lines.push(
      "**Supporting earnings calendar (not a substitute for implied move)**",
      earningsLine,
      "",
    );
  }

  lines.push("Status: **RESEARCH ONLY / NO TRADE** — implied move is not a BUY/SELL signal.");
  return lines.join("\n");
}

export function formatRatesBackdropReply(
  backdrop: Awaited<ReturnType<typeof fetchFredMacroBackdrop>>,
): string {
  const lines = [
    "**Current rates backdrop (plain English)**",
    "",
  ];

  if (!backdrop.available) {
    lines.push(
      "Status: **UNAVAILABLE / WAIT**",
      `- **Reason:** ${backdrop.error ?? "FRED series not retrieved"}`,
      `- **Source:** ${backdrop.source}`,
      "",
      "I will **not** invent fed funds, 10-year yields, or curve levels.",
      "",
      "In plain English (definitions only, not current readings):",
      "- **Fed funds:** overnight policy rate set by the Fed.",
      "- **10-year Treasury:** longer-term growth/inflation/term-premium gauge.",
      "- **Curve (e.g. 10Y–2Y):** gap between long and short yields; inverted often signals tight policy / growth concern.",
    );
    return lines.join("\n");
  }

  const byId = Object.fromEntries(backdrop.series.map((s) => [s.seriesId, s]));
  const fed = byId.FEDFUNDS;
  const dgs10 = byId.DGS10;
  const curve = byId.T10Y2Y;

  lines.push(`_Source: ${backdrop.source} · as of bundle ${backdrop.asOf}_`, "");

  if (fed?.value != null) {
    lines.push(
      `**Fed funds:** ${fed.value}% (observation date ${fed.date}). This is the overnight policy rate — how restrictive money is today.`,
    );
  } else {
    lines.push("**Fed funds:** WAIT — series not in this snapshot.");
  }

  if (dgs10?.value != null) {
    lines.push(
      `**10-year Treasury:** ${dgs10.value}% (as of ${dgs10.date}). This is what markets price for longer-term growth, inflation, and term premium — it matters for equity valuations, especially long-duration tech.`,
    );
  } else {
    lines.push("**10-year Treasury:** WAIT — series not in this snapshot.");
  }

  if (curve?.value != null) {
    const slope =
      curve.value < -0.1 ? "inverted" : curve.value < 0.3 ? "flat-to-mildly steep" : "steepening/steep";
    lines.push(
      `**Curve (10Y–2Y spread):** ${curve.value} pp (as of ${curve.date}) — currently **${slope}**. ` +
        "Inverted (short > long) often signals tight policy and growth caution; a rising long end vs short can pressure growth multiples.",
    );
  } else {
    lines.push("**Yield curve:** WAIT — spread series not in this snapshot.");
  }

  lines.push("", "**Other verified FRED readings:**");
  for (const row of formatFredMacroBrief(backdrop)) {
    lines.push(`- ${row}`);
  }
  lines.push("", "Status: **RESEARCH ONLY** — a rates backdrop is not a trade signal.");
  return lines.join("\n");
}

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

  const contentAsk = isFilingContentQuery(text);
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
        if (contentAsk) {
          blocks.push(
            `**${sym} — ${specificForm} content Q&A: UNAVAILABLE**\n` +
              `I found the filing metadata, but **full-text extract is not wired**, so I cannot answer what it *says* about guidance, concentration, risk factors, or other narrative items.\n\n` +
              `- **Filed:** ${match.filedAt}\n` +
              `- **Form:** ${match.form}\n` +
              `- **Title:** ${match.title}\n` +
              `- **Source:** SEC EDGAR\n` +
              `- **Verified:** ${layer.timestamp}\n` +
              `- [Open on sec.gov](${match.url})\n\n` +
              `Status: **WAIT** — 10-K/10-Q/8-K text extraction (or guidance API) required.\n` +
              `I will **not** invent filing language from the link alone.`,
          );
        } else {
          blocks.push(
            `**${sym}'s latest ${specificForm}**\n` +
              `- **Filed:** ${match.filedAt}\n` +
              `- **Form:** ${match.form}\n` +
              `- **Title:** ${match.title}\n` +
              `- **Source:** SEC EDGAR\n` +
              `- **Verified:** ${layer.timestamp}\n` +
              `- [View on sec.gov](${match.url})`,
          );
        }
      } else {
        const available = filings.slice(0, 3).map((f) => `${f.form} (${f.filedAt})`).join(", ");
        blocks.push(
          `**${sym}'s latest ${specificForm}** is not in the recent EDGAR filings.\n` +
            `Available recent filings: ${available}\n` +
            `- **Source:** SEC EDGAR\n` +
            `- **Verified:** ${layer.timestamp}`,
        );
      }
    } else if (contentAsk) {
      const top = filings[0];
      blocks.push(
        `**${sym} — filing content Q&A: UNAVAILABLE**\n` +
          `Recent EDGAR metadata is available, but I cannot quote or paraphrase body text without a verified extract.\n\n` +
          `- Latest listed: **${top.form}** filed ${top.filedAt} — [sec.gov](${top.url})\n` +
          `- **Verified:** ${layer.timestamp}\n\n` +
          `Status: **WAIT** — full-text filing extract required.\n` +
          `I will **not** invent what the filing said.`,
      );
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

  if (isDeskCompareQuery(text)) {
    return formatDeskCompareReply(text, bundle);
  }

  // Multi-layer compare queries must not short-circuit on "SEC filings" alone.
  if (isCrossFeatureQuery(text)) {
    const cross = formatCrossFeatureReply(text, bundle);
    if (cross) return cross;
  }

  // Risk/reward before earnings-date shortcut (Phase 0: P0-RISK-001).
  if (isRiskRewardQuery(text)) {
    return formatRiskRewardPartialReply(text, bundle);
  }

  if (isFundamentalSeriesQuery(text)) {
    return formatFundamentalSeriesUnavailableReply(resolveSymbolsFromText(text));
  }

  // Implied move must not collapse to earnings-date-only (Phase 2).
  if (isImpliedMoveQuery(text)) {
    return null; // handled async in tryDeterministicDataReply
  }

  if (FILING_QUERY_RE.test(text)) {
    const edgarReply = formatEdgarReply(text, bundle);
    if (edgarReply) return edgarReply;
    if (isFilingContentQuery(text)) {
      const syms = resolveSymbolsFromText(text);
      const label = syms.join(", ") || "that symbol";
      return [
        `**Filing content Q&A: UNAVAILABLE** for **${label}**.`,
        "",
        "No verified EDGAR metadata/extract is attached for this ask.",
        "Status: **WAIT** — I will not invent what a 10-K/8-K said.",
      ].join("\n");
    }
  }

  // Earnings date shortcut — skip when the real ask is implied move.
  if (EARNINGS_QUERY_RE.test(text) && !isImpliedMoveQuery(text)) {
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

  if (isHistoricalPriceQuery(text)) {
    return null; // handled in tryDeterministicPriceReply / tryDeterministicDataReply
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
  // NL screener — never resolve ABOVE/SECTOR as tickers (Phase 0: P0-TECH-005).
  if (isNlScreenerQuery(text)) {
    return {
      reply: formatNlScreenerUnavailableReply(text),
      meta: gapMeta([], "nl-screener-gate"),
    };
  }

  // Multi-name / multi-quarter fundamental series (Phase 0: P0-FUND-003).
  if (isFundamentalSeriesQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    return {
      reply: formatFundamentalSeriesUnavailableReply(symbols),
      meta: gapMeta(symbols, "fundamental-series-gate"),
    };
  }

  // Client Rev 9/14 — US general market / discovery / movers (before LLM or GDELT-only macro).
  const marketReply = await tryMarketIntelligenceReply(userId, text).catch(() => null);
  if (marketReply) return marketReply;

  // Implied move — before earnings-day calendar so "into earnings" cannot steal (Phase 2 Pack E).
  if (isImpliedMoveQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    const sym = symbols[0];
    if (!sym) {
      return {
        reply: [
          "**Implied move: WAIT**",
          "",
          "No ticker resolved. Ask e.g. `What's the implied move for AAPL into earnings?`",
        ].join("\n"),
        meta: gapMeta([], "implied-move-gate"),
      };
    }
    const [implied, { bundle }] = await Promise.all([
      fetchImpliedMove(sym).catch((e) => ({
        available: false as const,
        mock: false,
        source: "Massive Options",
        error: (e as Error).message,
        symbol: sym,
        impliedMovePct: null,
        iv: null,
        ivRank: null,
        expiry: null,
        underlyingPrice: null,
        detail: (e as Error).message,
      })),
      buildIntelligenceBundle(userId, text, [], { includeWatchlist: false }),
    ]);
    const earnLayer = bundle.layers.find(
      (l) => l.layer === "earnings" && l.ticker === sym && l.available,
    );
    const earnLine = earnLayer ? formatEarningsLine(earnLayer) : null;
    return {
      reply: formatImpliedMoveReply(sym, implied, earnLine),
      meta: { ...toMarketMeta(bundle), symbols: [sym], sourceName: implied.source },
    };
  }

  // Rates backdrop — use FRED when available (Phase 2 Pack G).
  if (isRatesBackdropQuery(text)) {
    const backdrop = await fetchFredMacroBackdrop().catch((e) => ({
      available: false,
      asOf: new Date().toISOString(),
      series: [],
      source: "FRED",
      error: (e as Error).message,
    }));
    return {
      reply: formatRatesBackdropReply(backdrop),
      meta: gapMeta([], backdrop.source),
    };
  }

  // Day-board calendar (e.g. "Tuesday quarterly earnings") — no ticker required.
  // Bound wait so a slow Finnhub fan-out cannot freeze the whole Intelligence stream.
  const dayCalendar = await Promise.race([
    tryEarningsDayCalendarReply(text).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 55_000)),
  ]);
  if (dayCalendar) {
    let reply = dayCalendar.reply;
    // Compound screen honesty: beat-rate applied, implied-move filter not (Phase 2 Pack H).
    if (
      /\bimplied\s+move\b/i.test(text) &&
      /\b(over|above|>|greater\s+than)\s*\d/i.test(text)
    ) {
      reply += [
        "",
        "",
        "**PARTIAL / WAIT:** An **implied move** threshold was requested but **not applied** on this earnings-calendar path (options IV screen not wired here).",
        "Beat-rate / surprise screens above are what ran. For a single name: `What's the implied move for TICKER into earnings?`",
      ].join("\n");
    }
    return {
      reply,
      meta: {
        symbols: dayCalendar.meta.symbols,
        source: dayCalendar.meta.source,
        sourceName: dayCalendar.meta.sourceName,
        stale: dayCalendar.meta.stale,
        timestamp: dayCalendar.meta.timestamp,
      },
    };
  }

  // Historical close / dated price — never live quote (Phase 0: P0-TRUST-001).
  if (isHistoricalPriceQuery(text)) {
    const hist = await tryDeterministicPriceReply(userId, text).catch(() => null);
    if (hist) return hist;
  }

  // Risk/reward needs bundle context but must not be skipped by bare price path.
  if (isRiskRewardQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    if (symbols.length) {
      const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });
      return {
        reply: formatRiskRewardPartialReply(text, bundle),
        meta: { ...toMarketMeta(bundle), symbols },
      };
    }
    return {
      reply: formatRiskRewardPartialReply(text, null),
      meta: gapMeta([], "risk-reward-gate"),
    };
  }

  // Desk / multi-factor compare — never price-only short-circuit (Phase 2).
  if (isDeskCompareQuery(text)) {
    const symbols = resolveSymbolsFromText(text);
    if (!symbols.length) {
      return {
        reply: [
          "**Research-desk compare: WAIT**",
          "",
          "No verified tickers were resolved from the prompt.",
          "Name the companies or tickers to compare (e.g. Apple and Microsoft).",
        ].join("\n"),
        meta: gapMeta([], "desk-compare-gate"),
      };
    }
    const { bundle } = await buildIntelligenceBundle(userId, text, [], { includeWatchlist: false });
    return {
      reply: formatDeskCompareReply(text, bundle),
      meta: { ...toMarketMeta(bundle), symbols, sourceName: "desk-compare" },
    };
  }

  if (
    !SENTIMENT_QUERY_RE.test(text) &&
    !FILING_QUERY_RE.test(text) &&
    !EARNINGS_QUERY_RE.test(text) &&
    !MACRO_QUERY_RE.test(text) &&
    !isCrossFeatureQuery(text) &&
    !isDeskCompareQuery(text)
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
