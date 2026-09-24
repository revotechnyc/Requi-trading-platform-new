/**
 * Phase A — Global intent firewall (additive).
 *
 * Classifies each user turn into a closed intent set and decides when a
 * conversation-context *rewrite* must be forced to passthrough so a prior
 * working set (e.g. earnings screen) cannot steal a new ask (e.g. technicals).
 *
 * Does NOT replace handlers — only blocks unsafe rewrites. Existing detectors
 * remain the source of truth for classification.
 */
import { classifyMarketIntelligenceIntent, isConversationAck, isBriefGreeting, isFreshMarketIntelligenceAsk } from "./market-intent";
import {
  isDeskCompareQuery,
  isHypotheticalPortfolioQuery,
  isTechnicalIndicatorQuery,
  isConversationalFundamentalQuery,
  shouldPassthroughGapGateAsk,
} from "./gap-intents";
import { isEarningsResearchProtocol } from "./research/earnings-candidate";
import { STATUS_TRIGGERS, TRADE_TRIGGERS, isNonImperativeResearchAsk } from "./intent";

function hasLightReferential(text: string): boolean {
  return /\b(those|them|these|both|the\s+rest|the\s+remaining|all\s+of\s+them)\b/i.test(text);
}

export type GlobalIntent =
  | "MOVERS"
  | "DISCOVERY"
  | "GENERAL_MARKET"
  | "DESK_COMPARE"
  | "EARNINGS_SCREEN"
  | "EARNINGS_RESEARCH"
  | "TECHNICALS"
  | "HYP_PORTFOLIO"
  | "STATUS"
  | "TRADE"
  | "FUNDAMENTALS_CHAT"
  | "GAP_GATE"
  | "CHITCHAT"
  | "UNKNOWN";

export type IntentFamily =
  | "market"
  | "desk"
  | "earnings"
  | "technicals"
  | "portfolio"
  | "status"
  | "trade"
  | "fundamentals"
  | "gap"
  | "chat"
  | "unknown";

/** Intents that must never inherit a prior earnings / research working set. */
const HARD_RESET_INTENTS: ReadonlySet<GlobalIntent> = new Set([
  "MOVERS",
  "DISCOVERY",
  "GENERAL_MARKET",
  "DESK_COMPARE",
  "TECHNICALS",
  "HYP_PORTFOLIO",
  "STATUS",
  "FUNDAMENTALS_CHAT",
  "GAP_GATE",
]);

export function intentFamily(intent: GlobalIntent): IntentFamily {
  switch (intent) {
    case "MOVERS":
    case "DISCOVERY":
    case "GENERAL_MARKET":
      return "market";
    case "DESK_COMPARE":
      return "desk";
    case "EARNINGS_SCREEN":
    case "EARNINGS_RESEARCH":
      return "earnings";
    case "TECHNICALS":
      return "technicals";
    case "HYP_PORTFOLIO":
      return "portfolio";
    case "STATUS":
      return "status";
    case "TRADE":
      return "trade";
    case "FUNDAMENTALS_CHAT":
      return "fundamentals";
    case "GAP_GATE":
      return "gap";
    case "CHITCHAT":
      return "chat";
    default:
      return "unknown";
  }
}

/**
 * Classify a user turn using existing detectors (order = priority).
 * Pure — no side effects.
 */
export function classifyGlobalIntent(text: string): GlobalIntent {
  const t = text.trim();
  if (!t) return "UNKNOWN";
  if (isConversationAck(t) || isBriefGreeting(t)) return "CHITCHAT";

  if (isHypotheticalPortfolioQuery(t)) return "HYP_PORTFOLIO";
  if (isDeskCompareQuery(t)) return "DESK_COMPARE";
  if (isTechnicalIndicatorQuery(t)) return "TECHNICALS";

  // Earnings calendar auto-screen / Rev-1 protocol (before generic market)
  if (isEarningsResearchProtocol(t) || isNonImperativeResearchAsk(t)) {
    if (
      /\b(next\s+(?:\d+|seven)\s+days?|within\s+the\s+next|over\s+the\s+next|upcoming|reporting\s+earnings)\b/i.test(
        t,
      ) &&
      !/\bRun earnings candidate research on\b/i.test(t)
    ) {
      return "EARNINGS_SCREEN";
    }
    return "EARNINGS_RESEARCH";
  }

  if (isConversationalFundamentalQuery(t)) return "FUNDAMENTALS_CHAT";

  // Gap gates that must passthrough (screener, risk/reward, implied move, …)
  if (shouldPassthroughGapGateAsk(t) && !isDeskCompareQuery(t) && !isTechnicalIndicatorQuery(t) && !isHypotheticalPortfolioQuery(t)) {
    return "GAP_GATE";
  }

  const market = classifyMarketIntelligenceIntent(t);
  if (market === "MARKET_MOVERS") return "MOVERS";
  if (market === "STOCK_DISCOVERY") return "DISCOVERY";
  if (market === "GENERAL_MARKET") return "GENERAL_MARKET";

  if (STATUS_TRIGGERS.test(t) && !isHypotheticalPortfolioQuery(t) && !TRADE_TRIGGERS.test(t)) {
    return "STATUS";
  }
  if (TRADE_TRIGGERS.test(t) && !/\?/.test(t)) return "TRADE";

  return "UNKNOWN";
}

/** Infer prior global intent from legacy lastHandler when lastGlobalIntent unset. */
export function inferGlobalIntentFromHandler(
  lastHandler: "earnings_day" | "research" | "data_reply" | "live_gate" | "other" | undefined,
): GlobalIntent | undefined {
  if (!lastHandler) return undefined;
  switch (lastHandler) {
    case "earnings_day":
      return "EARNINGS_SCREEN";
    case "research":
      return "EARNINGS_RESEARCH";
    case "data_reply":
      return "UNKNOWN";
    case "live_gate":
      return "TRADE";
    default:
      return undefined;
  }
}

export type FirewallWorkingSetView = {
  lastGlobalIntent?: GlobalIntent;
  lastHandler?: "earnings_day" | "research" | "data_reply" | "live_gate" | "other";
  active: unknown[];
  ranked: unknown[];
};

/**
 * True when conversation-context must NOT rewrite this turn onto the prior
 * working set. Safe default: false (preserve existing rewrite behavior).
 */
export function shouldForcePassthroughTransition(
  text: string,
  ws: FirewallWorkingSetView,
): boolean {
  const next = classifyGlobalIntent(text);
  const prev =
    ws.lastGlobalIntent ?? inferGlobalIntentFromHandler(ws.lastHandler);
  const hasScope = (ws.active?.length ?? 0) > 0 || (ws.ranked?.length ?? 0) > 0;
  const prevFamily = prev ? intentFamily(prev) : "unknown";
  const earningsScope =
    prevFamily === "earnings" ||
    ws.lastHandler === "earnings_day" ||
    ws.lastHandler === "research";

  // Phase C — UNKNOWN after an earnings scope must not inherit Rev-1 rewrite
  // when the turn looks like a fresh non-referential ask (or market/desk/tech cues).
  if (next === "UNKNOWN" && hasScope && earningsScope && !hasLightReferential(text)) {
    if (
      isFreshMarketIntelligenceAsk(text) ||
      isDeskCompareQuery(text) ||
      isTechnicalIndicatorQuery(text) ||
      isHypotheticalPortfolioQuery(text) ||
      /\b(analy[sz]e|compare|movers?|volume|momentum|portfolio|macro|rates?)\b/i.test(text)
    ) {
      return true;
    }
  }

  if (next === "UNKNOWN" || next === "CHITCHAT") return false;
  if (!prev) return false;

  const sameFamily = intentFamily(next) === intentFamily(prev);
  if (sameFamily) return false;

  // Referential follow-ups inside a family are handled above; cross-family
  // "those" after earnings while asking technicals is still a hard reset.
  if (!hasScope) return false;

  if (HARD_RESET_INTENTS.has(next)) return true;

  // Fresh earnings *screen* (calendar universe) must not rewrite onto movers /
  // discovery / desk symbols left in the working set.
  if (next === "EARNINGS_SCREEN" && !hasLightReferential(text)) return true;

  return false;
}
