/**
 * Fallback market context for Lucia when the user message has no tickers
 * but general research or a greeting should still see live US index data.
 */
import { runGeneralMarketAnalysis } from "./general-market";
import {
  classifyMarketIntelligenceIntent,
  isConversationAck,
  isPortfolioSpecificQuery,
} from "./market-intent";
import type { MarketMeta } from "./tools";

function fmtPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "n/a";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

/** Attach index snapshot so Lucia does not claim market data is missing. */
export async function buildFallbackMarketSnapshotBlock(
  userId: string,
  text: string,
): Promise<{ block: string; meta: MarketMeta | null }> {
  if (isConversationAck(text) || isPortfolioSpecificQuery(text)) {
    return { block: "", meta: null };
  }

  const trimmed = text.trim();
  const needsSnapshot =
    classifyMarketIntelligenceIntent(text) !== null ||
    /^(hi|hey|hello|yo|good morning|good afternoon)\b[.!]?$/i.test(trimmed) ||
    /\bhow are you\b/i.test(trimmed);

  if (!needsSnapshot) return { block: "", meta: null };

  const analysis = await runGeneralMarketAnalysis(userId).catch(() => null);
  const live = analysis?.indexes.filter((i) => i.available) ?? [];
  if (!live.length) return { block: "", meta: null };

  const indexLines = live.map(
    (i) =>
      `- **${i.symbol}** $${typeof i.price === "number" ? i.price.toFixed(2) : "n/a"} (${fmtPct(i.dailyChangePct)}) · ${i.source ?? "Market Data Gateway"}`,
  );

  const block = [
    "=== US MARKET SNAPSHOT (authoritative gateway data — cite source + timestamp in replies) ===",
    `Regime: ${analysis!.regime.replace(/_/g, " ")} · Market health ${analysis!.marketHealth}/100`,
    ...indexLines,
    "General market research does NOT require a connected portfolio or brokerage account.",
  ].join("\n");

  const first = live[0]!;
  return {
    block: `\n\n${block}`,
    meta: {
      symbols: live.map((i) => i.symbol),
      source: first.source?.toLowerCase() ?? "yfinance",
      sourceName: first.source ?? "Yahoo Finance",
      stale: first.stale ?? false,
      timestamp: first.timestamp ?? new Date().toISOString(),
    },
  };
}
