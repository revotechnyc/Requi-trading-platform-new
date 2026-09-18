/**
 * Conversation context orchestrator — intent → entity resolution → scope → action.
 *
 * Design: handlers stay pure; this module classifies follow-up intent, resolves
 * which tickers the user means (active vs full ranked universe), and rewrites
 * to deterministic handler prompts or returns a cached selection reply.
 */

import {
  filterLikelyFalsePositiveTickers,
  resolveContextSymbolsFromText,
  resolveSymbolsFromText,
} from "../intelligence-data/symbol-resolver";
import { shouldPassthroughGapGateAsk, isDeskCompareQuery } from "./gap-intents";
import {
  isDiscoveryFollowUpQuery,
  isDiscoveryRankExplainQuery,
  isDiscoveryRiskiestQuery,
  isFreshMarketIntelligenceAsk,
} from "./market-intent";

export type WorkingEntity = {
  symbol: string;
  score?: number | null;
  classification?: string | null;
  rank?: number | null;
};

export type FollowUpIntentType =
  | "passthrough"
  | "clarify"
  | "select"
  | "rank"
  | "research"
  | "go_deeper"
  | "compare"
  | "remove"
  | "day_switch"
  | "group_ref";

export type ConversationWorkingSet = {
  key: string;
  userId: string;
  /** Current scope — what "those / them / these" refer to. */
  active: WorkingEntity[];
  /** Full universe from the last rank/research (preserved when active narrows). */
  ranked: WorkingEntity[];
  groups: Record<string, WorkingEntity[]>;
  lastIntent?: FollowUpIntentType;
  lastHandler?: "earnings_day" | "research" | "data_reply" | "live_gate" | "other";
  lastUniverseLabel?: string;
  updatedAt: number;
};

export type ContextPlan =
  | { kind: "passthrough"; text: string }
  | { kind: "clarify"; question: string }
  | {
      kind: "reply";
      reply: string;
      note?: string;
      intent: FollowUpIntentType;
      /** Apply to working set before returning. */
      applyActive: WorkingEntity[];
    }
  | {
      kind: "rewrite";
      text: string;
      note?: string;
      intent: FollowUpIntentType;
      action:
        | "research"
        | "calendar"
        | "compare"
        | "narrow"
        | "rank"
        | "calendar_then_research";
      /** Symbols the handler should run on (for post-handler scope sync). */
      targetSymbols?: string[];
      /** After handler, shrink active to this subset (ranked unchanged). */
      nextActive?: WorkingEntity[];
      /** Select top vs bottom of ranked scores (default top). */
      selectSide?: "top" | "bottom";
    };

const store = new Map<string, ConversationWorkingSet>();

export const MAX_ACTIVE = 40;
export const CONTEXT_RESEARCH_MAX = 12;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  couple: 2,
  few: 3,
};

function keyFor(userId: string, conversationId?: string): string {
  return conversationId?.trim() ? `c:${conversationId}` : `u:${userId}`;
}

export function getWorkingSet(userId: string, conversationId?: string): ConversationWorkingSet {
  const key = keyFor(userId, conversationId);
  const existing = store.get(key);
  if (existing) return existing;
  const fresh: ConversationWorkingSet = {
    key,
    userId,
    active: [],
    ranked: [],
    groups: {},
    updatedAt: Date.now(),
  };
  store.set(key, fresh);
  return fresh;
}

export function clearWorkingSet(userId: string, conversationId?: string): void {
  store.delete(keyFor(userId, conversationId));
}

function uniqEntities(list: WorkingEntity[]): WorkingEntity[] {
  const seen = new Set<string>();
  const out: WorkingEntity[] = [];
  for (const e of list) {
    const sym = e.symbol.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push({ ...e, symbol: sym });
    if (out.length >= MAX_ACTIVE) break;
  }
  return out;
}

function symbolsLine(entities: WorkingEntity[], max = CONTEXT_RESEARCH_MAX): string {
  return entities
    .slice(0, max)
    .map((e) => e.symbol)
    .join(", ");
}

/** Full ranked universe (fallback when active empty). */
export function getRankedUniverse(ws: ConversationWorkingSet): WorkingEntity[] {
  const label = ws.lastUniverseLabel?.toLowerCase();
  if (label && ws.groups[label]?.length) return ws.groups[label]!;
  if (ws.lastHandler === "earnings_day" && ws.active.length) return ws.active;
  return ws.ranked.length ? ws.ranked : ws.active;
}

/** What referential pronouns resolve to — prefer semantic group match over last active scope. */
export function getReferentialTarget(ws: ConversationWorkingSet): WorkingEntity[] {
  if (ws.active.length) return ws.active;
  if (ws.groups.focus?.length) return ws.groups.focus;
  return ws.ranked;
}

const GROUP_DISPLAY: Record<string, string> = {
  stock_discovery: "buy / discovery candidates",
  market_movers: "today's movers scan",
  universe: "last research universe",
};

const SKIP_REFERENTIAL_GROUPS = new Set(["focus", "last_selection"]);

function referentialGroupKeys(ws: ConversationWorkingSet): string[] {
  return Object.keys(ws.groups).filter(
    (k) => !SKIP_REFERENTIAL_GROUPS.has(k) && (ws.groups[k]?.length ?? 0) > 0,
  );
}

function scoreReferentialGroup(text: string, groupKey: string, ws: ConversationWorkingSet): number {
  const lower = text.toLowerCase();
  let score = 0;

  if (groupKey === "stock_discovery") {
    const moversWasLast = ws.lastUniverseLabel === "market_movers";
    if (isDiscoveryFollowUpQuery(text) && !(moversWasLast && isDiscoveryRankExplainQuery(text))) {
      score += 100;
    }
    if (isDiscoveryRankExplainQuery(text) && !moversWasLast) score += 85;
    if (isDiscoveryRiskiestQuery(text) && !/\b(earnings|evidence|partial score|rev-?1)\b/i.test(text)) {
      score += 75;
    }
    if (
      /\b(buy|candidates?|discovery|ranked|focus sector|should i buy)\b/i.test(lower) &&
      !(moversWasLast && isDiscoveryRankExplainQuery(text))
    ) {
      score += 45;
    }
    if (/\b(rank(ed)?\s+#?1|top one ranked|ranked first)\b/i.test(lower) && !moversWasLast) score += 60;
  }

  if (groupKey === "market_movers") {
    if (/\b(moving|movers?|gainers?|losers?|what's hot|crashing|biggest move)\b/i.test(lower)) {
      score += 65;
    }
    if (/\bwhy is .+ moving\b/i.test(lower)) score += 70;
    if (isDiscoveryRankExplainQuery(text) && ws.lastUniverseLabel === "market_movers") score += 95;
  }

  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)$/.test(groupKey)) {
    if (new RegExp(`\\b${groupKey}\\b`, "i").test(lower)) score += 90;
    if (/\b(earnings|report|amc|bmo|calendar)\b/i.test(lower)) score += 35;
  }

  if (groupKey === "universe") {
    if (/\b(research|rev-?1|partial score|evidence|go deeper)\b/i.test(lower)) score += 40;
  }

  if (/\b(go deeper|drill down|more detail)\b/i.test(lower)) {
    if (groupKey === ws.lastUniverseLabel?.toLowerCase()) score += 15;
  }

  // Never boost last message alone — only a weak tie-breaker after topic signals.
  if (groupKey === ws.lastUniverseLabel?.toLowerCase()) score += 5;

  return score;
}

export type ReferentialResolution =
  | { pool: WorkingEntity[]; label: string }
  | { ambiguous: true; question: string };

function formatReferentialClarify(
  a: { key: string; pool: WorkingEntity[] },
  b: { key: string; pool: WorkingEntity[] },
): string {
  const labelA = GROUP_DISPLAY[a.key] ?? a.key.replace(/_/g, " ");
  const labelB = GROUP_DISPLAY[b.key] ?? b.key.replace(/_/g, " ");
  return [
    "I have more than one list in this chat — which do you mean?",
    "",
    `- **${labelA}:** ${symbolsLine(a.pool, 6)}`,
    `- **${labelB}:** ${symbolsLine(b.pool, 6)}`,
  ].join("\n");
}

/**
 * Resolve "those / them / the top one" to the intended universe using topic cues —
 * not whichever handler ran last.
 */
export function resolveReferentialUniverse(
  text: string,
  ws: ConversationWorkingSet,
): ReferentialResolution | null {
  const explicit = resolveContextSymbolsFromText(text);
  const referential = hasReferentialLanguage(text);
  const contextual = isContextualFollowUp(text, ws, explicit);
  const wantsReferential =
    referential || contextual || isDiscoveryFollowUpQuery(text) || isDiscoveryRankExplainQuery(text);

  if (!wantsReferential) return null;

  const keys = referentialGroupKeys(ws);
  const scored = keys
    .map((key) => ({
      key,
      pool: ws.groups[key]!,
      score: scoreReferentialGroup(text, key, ws),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length >= 2) {
    const top = scored[0]!;
    const second = scored[1]!;
    if (top.score - second.score < 20 && top.score < 85) {
      return { ambiguous: true, question: formatReferentialClarify(top, second) };
    }
  }

  if (scored.length) {
    return { pool: scored[0]!.pool, label: scored[0]!.key };
  }

  const fallback = getReferentialTarget(ws);
  if (fallback.length) {
    return { pool: fallback, label: ws.lastUniverseLabel ?? "active" };
  }
  return null;
}

export function setActiveEntities(
  ws: ConversationWorkingSet,
  symbols: string[],
  opts?: {
    scores?: Record<string, number | null | undefined>;
    classifications?: Record<string, string | null | undefined>;
    asRanked?: boolean;
    groupLabel?: string;
    handler?: ConversationWorkingSet["lastHandler"];
    preserveRanked?: boolean;
  },
): ConversationWorkingSet {
  const scoreMap = opts?.scores ?? {};
  const classMap = opts?.classifications ?? {};
  const entities = uniqEntities(
    symbols.map((s, i) => ({
      symbol: s,
      score: scoreMap[s.toUpperCase()] ?? ws.ranked.find((e) => e.symbol === s.toUpperCase())?.score ?? null,
      classification:
        (classMap[s.toUpperCase()] as string | null | undefined) ??
        ws.ranked.find((e) => e.symbol === s.toUpperCase())?.classification ??
        null,
      rank: i + 1,
    })),
  );
  ws.active = entities;
  const updateRanked = opts?.asRanked !== false && !opts?.preserveRanked;
  if (updateRanked) ws.ranked = [...entities];
  if (opts?.groupLabel) {
    ws.groups[opts.groupLabel.toLowerCase()] = [...entities];
    ws.lastUniverseLabel = opts.groupLabel;
  }
  if (opts?.handler) ws.lastHandler = opts.handler;
  ws.updatedAt = Date.now();
  store.set(ws.key, ws);
  return ws;
}

export function applyActiveSubset(
  ws: ConversationWorkingSet,
  subset: WorkingEntity[],
  intent: FollowUpIntentType,
): ConversationWorkingSet {
  ws.active = uniqEntities(subset);
  ws.groups.focus = [...ws.active];
  if (intent === "select" && ws.active.length) {
    ws.groups[`top_${ws.active.length}`] = [...ws.active];
    ws.groups.last_selection = [...ws.active];
  }
  ws.lastIntent = intent;
  ws.updatedAt = Date.now();
  store.set(ws.key, ws);
  return ws;
}

export function recordResearchResults(
  ws: ConversationWorkingSet,
  results: Array<{ symbol: string; rawScore?: number | null; classification?: string }>,
  opts?: { groupLabel?: string; lastHandler?: ConversationWorkingSet["lastHandler"] },
): ConversationWorkingSet {
  const ranked = uniqEntities(
    [...results]
      .sort((a, b) => (b.rawScore ?? -1) - (a.rawScore ?? -1))
      .map((r, i) => ({
        symbol: r.symbol,
        score: r.rawScore ?? null,
        classification: r.classification ?? null,
        rank: i + 1,
      })),
  );
  ws.ranked = ranked;
  ws.active = ranked;
  if (ranked.length >= 2) ws.groups.universe = [...ranked];
  if (opts?.groupLabel) {
    ws.groups[opts.groupLabel.toLowerCase()] = [...ranked];
    ws.lastUniverseLabel = opts.groupLabel;
  }
  ws.lastHandler = opts?.lastHandler ?? "research";
  ws.lastIntent = "research";
  ws.updatedAt = Date.now();
  store.set(ws.key, ws);
  return ws;
}

/** Parse counts from natural language (not only "top 3" keywords). */
function quantityTokenToNumber(token: string): number | null {
  if (WORD_NUMBERS[token]) return WORD_NUMBERS[token];
  const n = Number(token);
  if (Number.isFinite(n) && n >= 1 && n <= 10) return n;
  return null;
}

export function parseQuantity(text: string): number | null {
  const lower = text.toLowerCase();

  // "isolate the two", "pick the top 3", "keep only the three", "want only top 3"
  const verbQty = lower.match(
    /\b(isolate|pick|select|take|show|give|remove|keep|want|narrow\s+to)\s+(?:only\s+)?(?:the\s+)?(?:top\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/,
  );
  if (verbQty) {
    const n = quantityTokenToNumber(verbQty[2]!);
    if (n) return n;
  }

  // "only the three", "only the top 3", "only three which is top"
  const onlyQty = lower.match(
    /\bonly\s+(?:the\s+)?(?:top\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/,
  );
  if (onlyQty) {
    const n = quantityTokenToNumber(onlyQty[1]!);
    if (n) return n;
  }

  const identifyQty = lower.match(
    /\b(?:identify|find|name)\s+(?:the\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/,
  );
  if (identifyQty) {
    const n = quantityTokenToNumber(identifyQty[1]!);
    if (n) return n;
  }

  if (/\b(top|best|strongest|first|weakest|worst|bottom)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/.test(lower)) {
    const m = lower.match(
      /\b(top|best|strongest|first|weakest|worst|bottom)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/,
    );
    const n = quantityTokenToNumber(m?.[2] ?? "");
    if (n) return n;
  }

  if (/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(strongest|best|top|weakest|worst|promising|candidates)\b/.test(lower)) {
    const m = lower.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s+(strongest|best|top|weakest|worst|promising|candidates)\b/,
    );
    const n = quantityTokenToNumber(m?.[1] ?? "");
    if (n) return n;
  }

  if (/\bwhich\s+(of\s+the\s+)?(remaining\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/.test(lower)) {
    const m = lower.match(/\bwhich\s+(?:of\s+the\s+)?(?:remaining\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/);
    const n = quantityTokenToNumber(m?.[1] ?? "");
    if (n) return n;
  }

  if (/\b(those|the)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/.test(lower)) {
    const m = lower.match(/\b(those|the)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/);
    const n = quantityTokenToNumber(m?.[2] ?? "");
    if (n) return n;
  }

  const digit = lower.match(/\b(\d{1,2})\b/);
  if (digit) return Math.min(10, Math.max(1, Number(digit[1])));

  if (/\b(a\s+)?couple\b/.test(lower)) return 2;
  if (/\ba\s+few\b/.test(lower)) return 3;
  return null;
}

export function hasReferentialLanguage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\b(those|them|these|the\s+rest|the\s+others|the\s+remaining|all\s+of\s+them)\b/.test(t) ||
    /\b(the\s+companies?\s+(above|below|you\s+(just\s+)?(mentioned|listed|returned|analyzed|selected|ranked)))\b/.test(t) ||
    /\b(the\s+tickers?\s+(above|you\s+(just\s+)?(mentioned|listed|returned|selected)))\b/.test(t) ||
    /\b(the\s+ones?\s+you\s+(just\s+)?(mentioned|listed|returned|ranked|selected|picked))\b/.test(t) ||
    /\b(the\s+top\s+\d+|the\s+bottom\s+\d+|the\s+first|the\s+last)\b/.test(t) ||
    // "the three", "only the top three", "keep only top 3", "want only the three which is top"
    (/\b(only\s+)?(the\s+)?(top\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/.test(t) &&
      /\b(keep|want|only|top|best|strongest)\b/.test(t)) ||
    /\b(go\s+deeper|drill\s+down|more\s+detail|dig\s+deeper|expand\s+(the\s+)?analysis)\b/.test(t) ||
    /\b(rank\s+them|analyze\s+them|compare\s+them|remove\s+the\s+(weakest|riskiest|worst))\b/.test(t) ||
    /\b(which\s+ones?|which\s+(three|two|five|\d+)|look\s+strongest|strongest\s+ones?|best\s+ones?|focus\s+on)\b/.test(t) ||
    /\b(same\s+(thing|analysis|methodology|criteria)|do\s+the\s+same|apply\s+the\s+same|run\s+the\s+same)\b/.test(t) ||
    /\b(now\s+do|for\s+)(monday|tuesday|wednesday|thursday|friday|tomorrow)\b/.test(t) ||
    /\b(monday|tuesday|wednesday|thursday|friday)'?s\s+(group|companies|tickers|set)\b/.test(t) ||
    /\b(go\s+back\s+to|return\s+to)\s+(those|them|the\s+(three|two|top|five|original|full))\b/.test(t) ||
    /\b(return\s+to|restore)\s+(the\s+)?(original|full|five|12|twelve)[- ]?(name\s+)?(universe|group|set|list)\b/.test(t)
  );
}

function hasNamedTickerList(text: string, explicit: string[]): boolean {
  return explicit.length >= 2 || /:\s*[A-Z][A-Z0-9]{1,5}(?:\s*,\s*[A-Z][A-Z0-9]{1,5})+/i.test(text);
}

function wantsUniverseResearch(text: string, explicit: string[]): boolean {
  // Desk / multi-factor compares must not become earnings-candidate research
  // ("like a research desk", "valuation and momentum", …).
  if (isDeskCompareQuery(text)) return false;
  // Bare "research desk" / "like a research" is prose, not a protocol ask.
  if (/\bresearch\s+desk\b/i.test(text) || /\blike a research\b/i.test(text)) {
    if (!/\b(earnings\s+candidate|candidate\s+research|small-?cap\s+candidate)\b/i.test(text)) {
      return false;
    }
  }
  if (hasNamedTickerList(text, explicit)) {
    return /\b(analy[sz]e|research|run\s+(the\s+)?analysis|screen|identify)\b/i.test(text);
  }
  return /\b(analy[sz]e|research|run\s+(the\s+)?analysis|earnings\s+candidate)\b/i.test(text);
}

/** Follow-up verb with conversation state but no explicit tickers. */
function isContextualFollowUp(text: string, ws: ConversationWorkingSet, explicit: string[]): boolean {
  if (!ws.ranked.length && !ws.active.length) return false;
  const lower = text.toLowerCase();
  if (explicit.length > 0) return false;
  return (
    hasReferentialLanguage(text) ||
    /\b(rank|analyze|analyse|compare|remove|deeper|strongest|weakest|focus|pick|select|sort|keep|want|narrow|bottom)\b/.test(
      lower,
    ) ||
    (/\b(only|top|bottom)\b/.test(lower) &&
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/.test(lower))
  );
}

type IntentClassification = {
  intent: FollowUpIntentType;
  count?: number;
  day?: string;
  group?: string;
  removeWhich?: "weakest" | "riskiest" | "worst";
  /** top = strongest / best; bottom = weakest / worst. */
  selectSide?: "top" | "bottom";
  confidence: number;
};

/** Whether the user asked for bottom/worst N rather than top/best N. */
export function resolveSelectSide(text: string): "top" | "bottom" {
  const lower = text.toLowerCase();
  const wantsBottom = /\b(bottom|worst|weakest|lowest)\b/.test(lower);
  const wantsTop = /\b(top|best|strongest)\b/.test(lower);
  if (wantsBottom && !wantsTop) return "bottom";
  if (wantsBottom && /\bbottom\b/.test(lower)) return "bottom";
  return "top";
}

/**
 * Pick top or bottom N from a list already sorted best→worst (desc score).
 * Bottom picks are returned worst-first for the selection card.
 */
export function pickRankedSlice<T>(ranked: T[], count: number, side: "top" | "bottom" = "top"): T[] {
  const n = Math.max(1, Math.min(count, ranked.length || 1));
  if (side === "bottom") {
    return ranked.slice(-n).reverse();
  }
  return ranked.slice(0, n);
}

function weekdayFromText(text: string): string | null {
  const m = text.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i);
  return m ? m[1]!.toLowerCase() : null;
}

function resolveNamedGroup(ws: ConversationWorkingSet, text: string): WorkingEntity[] | null {
  const lower = text.toLowerCase();
  if (/\bmonday'?s\s+(group|companies|earnings|tickers|set)\b/.test(lower) && ws.groups.monday) {
    return ws.groups.monday;
  }
  if (/\btuesday'?s\s+(group|companies|earnings|tickers|set)\b/.test(lower) && ws.groups.tuesday) {
    return ws.groups.tuesday;
  }
  if (/\bprevious\s+group\b/.test(lower) && ws.groups.previous) return ws.groups.previous;
  if (/\b(go\s+back|return)\s+to\b/.test(lower)) {
    return ws.groups.focus ?? ws.active.slice(0, 3);
  }
  return null;
}

/** Score-based intent classifier — not a single keyword gate. */
export function classifyFollowUpIntent(text: string, ws: ConversationWorkingSet): IntentClassification {
  const lower = text.toLowerCase();
  const scores: Partial<Record<FollowUpIntentType, number>> = {};

  const day = weekdayFromText(text);
  const wantsSame =
    /\b(same\s+(thing|analysis|methodology|criteria|process)|do\s+the\s+same|apply\s+the\s+same|run\s+the\s+same)\b/.test(
      lower,
    ) || /\bnow\s+do\b/.test(lower);
  // Day-switch only when user is changing universe — not when they already named tickers.
  const hasExplicitTickers = resolveContextSymbolsFromText(text).length >= 1;
  if (day && !hasExplicitTickers && (wantsSame || /\b(earnings|report)\b/.test(lower))) {
    scores.day_switch = 80;
  }

  if (/\bmonday'?s|\btuesday'?s|previous\s+group\b/.test(lower) && /\b(group|companies|tickers)\b/.test(lower)) {
    scores.group_ref = 75;
  }

  const count = parseQuantity(text);

  // Discovery follow-ups — never select-top-1 or Rev-1 research (even if discovery group is missing).
  if (isDiscoveryFollowUpQuery(text)) {
    return { intent: "passthrough", confidence: 0 };
  }

  if (isFreshMarketIntelligenceAsk(text)) {
    return { intent: "passthrough", confidence: 0 };
  }

  const selectionSignals =
    (/\b(which|what|pick|select|show|give|take|focus|name|identify|keep|want|narrow)\b/.test(lower) ? 1 : 0) +
    (/\b(strongest|best|top|promising|stand\s+out|focus)\b/.test(lower) ? 1 : 0) +
    (/\bonly\b/.test(lower) ? 1 : 0) +
    (count ? 2 : 0) +
    (/\blook\s+strongest\b/.test(lower) ? 2 : 0);
  if (selectionSignals >= 2 && count) scores.select = 60 + selectionSignals * 5;
  if (count && /\bearnings\b/i.test(lower) && /\b(strongest|best|identify|candidates)\b/i.test(lower)) {
    scores.select = Math.max(scores.select ?? 0, 88);
  }
  // "I want only the top three" / "keep only the three which is top"
  if (
    count &&
    /\b(keep|want|only|narrow)\b/.test(lower) &&
    /\b(top|best|strongest|three|two|five|\d)\b/.test(lower)
  ) {
    scores.select = Math.max(scores.select ?? 0, 90);
  }
  // "bottom 3" / "info about bottom three" / "worst three"
  if (count && /\b(bottom|worst|weakest|lowest)\b/.test(lower)) {
    scores.select = Math.max(scores.select ?? 0, 92);
  }

  if (/\b(rank|ranking|sort|order\s+by|stack\s+rank)\b/.test(lower) || /\brank\s+them\b/.test(lower)) {
    scores.rank = 70;
  }

  if (
    /\b(weakest|worst|lowest)\b/.test(lower) &&
    (/\b(evidence|score|candidate|partial)\b/.test(lower) || /\bwhich\b/.test(lower))
  ) {
    scores.select = Math.max(scores.select ?? 0, 72);
  }

  if (
    /\b(go\s+deeper|drill\s+down|deeper\s+analysis|more\s+detail|dig\s+deeper|expand\s+analysis|full\s+breakdown)\b/.test(
      lower,
    )
  ) {
    scores.go_deeper = 85;
  }

  if (/\bremove\s+the\s+(weakest|riskiest|worst)\b/.test(lower)) scores.remove = 80;
  if (/\bcompare\b/.test(lower)) scores.compare = 75;

  if (
    /\b(analy[sz]e|research|run\s+(the\s+)?analysis|earnings\s+candidate)\b/.test(lower) ||
    /\b(those\s+tickers|these\s+companies|all\s+of\s+them)\b/.test(lower)
  ) {
    scores.research = 65;
  }

  if (/\b(those|them|these)\b/.test(lower) && !scores.go_deeper && !scores.compare) {
    scores.research = Math.max(scores.research ?? 0, 55);
  }

  // Tie-break: go_deeper beats generic research; select beats rank when count present
  let best: FollowUpIntentType = "passthrough";
  let bestScore = 0;
  for (const [intent, score] of Object.entries(scores) as [FollowUpIntentType, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }

  if (bestScore < 50) return { intent: "passthrough", confidence: 0 };

  const removeMatch = lower.match(/\bremove\s+the\s+(weakest|riskiest|worst)\b/);
  return {
    intent: best,
    count: count ?? undefined,
    day: day ?? undefined,
    group: resolveNamedGroup(ws, text) ? "named" : undefined,
    removeWhich: removeMatch ? (removeMatch[1] as "weakest" | "riskiest" | "worst") : undefined,
    selectSide: best === "select" ? resolveSelectSide(text) : undefined,
    confidence: bestScore,
  };
}

function formatSelectionReply(
  selected: WorkingEntity[],
  universeSize: number,
  count: number,
  side: "top" | "bottom" = "top",
): string {
  const label = side === "bottom" ? "bottom" : "top";
  const lines = [
    `## Selection — ${label} candidates from prior screen`,
    "",
    `_Active scope updated to **${selected.length}** symbol(s) (from ${universeSize} in the last ranked universe)._`,
    "_Partial scores are research screens only — not trade authorization._",
    "",
    "| Rank | Symbol | Partial score | Classification |",
    "|------|--------|---------------|----------------|",
    ...selected.map(
      (e, i) =>
        `| ${i + 1} | **${e.symbol}** | ${e.score ?? "n/a"} | ${e.classification ?? "n/a"} |`,
    ),
    "",
    "Say **Go deeper on those** to run full earnings candidate research on this subset only.",
  ];
  return lines.join("\n");
}

/**
 * After a select→rank rewrite (no cached scores), show the short selection card
 * instead of dumping full Rev-1 reports for the whole board (Phase 3 MT-001).
 */
export function formatSelectAfterRankReply(
  rankedResults: Array<{ symbol: string; rawScore?: number | null; classification?: string | null }>,
  count: number,
  side: "top" | "bottom" = "top",
): string {
  const universeSize = rankedResults.length;
  const picked = pickRankedSlice(rankedResults, count, side).map((r, i) => ({
    symbol: r.symbol,
    score: r.rawScore ?? null,
    classification: r.classification ?? null,
    rank: i + 1,
  }));
  return formatSelectionReply(picked, universeSize, count, side);
}

function formatCachedRankReply(ranked: WorkingEntity[]): string {
  const lines = [
    "## Ranked by partial score (available factors)",
    "",
    "_From the prior research run — no full re-fetch required._",
    "",
    "| Rank | Symbol | Partial score | Classification |",
    "|------|--------|---------------|----------------|",
    ...ranked.slice(0, CONTEXT_RESEARCH_MAX).map(
      (e, i) =>
        `| ${i + 1} | **${e.symbol}** | ${e.score ?? "n/a"} | ${e.classification ?? "n/a"} |`,
    ),
    "",
    "Partial scores are research screens only — not trade authorization.",
  ];
  return lines.join("\n");
}

function hasCachedScores(entities: WorkingEntity[]): boolean {
  return entities.length > 0 && entities.some((e) => e.score != null);
}

function formatScopeRestoreReply(label: string, entities: WorkingEntity[]): string {
  return [
    "## Scope reset",
    "",
    `Returned to **${label}** (${entities.length} symbol(s)): **${symbolsLine(entities)}**.`,
    "",
    "_Partial scores from prior research are preserved when available._",
  ].join("\n");
}

function formatWeakestEvidenceReply(weakest: WorkingEntity, pool: WorkingEntity[]): string {
  return [
    "## Weakest evidence (current pool)",
    "",
    `Among **${symbolsLine(pool)}**, **${weakest.symbol}** has the weakest available evidence:`,
    "",
    `| Symbol | Partial score | Classification |`,
    `|--------|---------------|----------------|`,
    `| **${weakest.symbol}** | ${weakest.score ?? "n/a"} | ${weakest.classification ?? "n/a"} |`,
    "",
    "_Research screens only — not trade authorization._",
  ].join("\n");
}

function resolveRemainingPool(ws: ConversationWorkingSet): WorkingEntity[] {
  const parent = ws.groups.top_5 ?? ws.groups.last_selection ?? ws.ranked;
  const current = new Set(ws.active.map((e) => e.symbol));
  return parent.filter((e) => !current.has(e.symbol));
}

/**
 * Main orchestrator entry — intent → scope → plan.
 */
export function planFromConversationContext(
  text: string,
  ws: ConversationWorkingSet,
): ContextPlan {
  const explicit = resolveContextSymbolsFromText(text);
  const referential = hasReferentialLanguage(text);
  const contextual = isContextualFollowUp(text, ws, explicit);

  // Phase 0 honesty gates — never rewrite into earnings research / scope-compare templates.
  // (Fixes: margin-trend compare collapsed to AAPL price dump; risk/reward → research on stale scope.)
  if (shouldPassthroughGapGateAsk(text)) {
    return { kind: "passthrough", text };
  }

  // Console chips + fresh market scans — never cached Rev-1 ranks or earnings rewrites.
  if (isFreshMarketIntelligenceAsk(text)) {
    return { kind: "passthrough", text };
  }

  // Stock-discovery follow-ups (Pack D2) — never steal into select-top-1 or Rev-1 research.
  if (isDiscoveryFollowUpQuery(text)) {
    const resolved = resolveReferentialUniverse(text, ws);
    if (resolved && "ambiguous" in resolved && resolved.ambiguous) {
      return { kind: "clarify", question: resolved.question };
    }
    if (ws.groups.stock_discovery?.length) {
      return { kind: "passthrough", text };
    }
    return {
      kind: "clarify",
      question: [
        "I don't have a **stock discovery** list in this chat yet.",
        "",
        "Ask e.g. `What should I buy today?` first — then follow up with rank or risk questions on that list.",
        "",
        "_Movers and discovery are separate lists — those follow-ups refer to discovery, not the movers scan._",
      ].join("\n"),
    };
  }

  // Handler-ready research prompts pass through unchanged.
  if (/^Run earnings candidate research on /i.test(text.trim())) {
    return { kind: "passthrough", text };
  }

  // Explicit named universe → earnings research (cold start or follow-up).
  if (explicit.length >= 1 && wantsUniverseResearch(text, explicit)) {
    const line = symbolsLine(explicit.map((s) => ({ symbol: s })));
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${line}`,
      intent: "research",
      action: "research",
      targetSymbols: explicit,
      note: `Context: analyzing ${explicit.length} explicitly named ticker(s) from your prompt (${line}).`,
    };
  }

  // Restore original / full universe
  if (
    /\b(return\s+to|go\s+back\s+to|restore)\b/i.test(text) &&
    /\b(original|full|initial|12|twelve)\b/i.test(text) &&
    /\b(universe|set|group|list)\b/i.test(text)
  ) {
    const uni = ws.groups.universe?.length ? ws.groups.universe : ws.ranked;
    if (uni.length) {
      return {
        kind: "reply",
        reply: formatScopeRestoreReply("original universe", uni),
        intent: "group_ref",
        applyActive: uni,
        note: `Context: restored original ${uni.length}-symbol universe.`,
      };
    }
  }

  // Restore five-name (or last selection) group
  if (/\b(return\s+to|go\s+back\s+to)\b/i.test(text) && /\b(five|5)[- ]name\b/i.test(text)) {
    const g = ws.groups.top_5 ?? ws.groups.last_selection;
    if (g?.length) {
      return {
        kind: "reply",
        reply: formatScopeRestoreReply("five-name group", g),
        intent: "group_ref",
        applyActive: g,
        note: `Context: restored five-name group (${symbolsLine(g)}).`,
      };
    }
  }

  if (explicit.length > 0 && !referential && !contextual) {
    return { kind: "passthrough", text };
  }
  if (!referential && !contextual) {
    return { kind: "passthrough", text };
  }

  const classified = classifyFollowUpIntent(text, ws);
  const resolved = resolveReferentialUniverse(text, ws);
  if (resolved && "ambiguous" in resolved && resolved.ambiguous) {
    return { kind: "clarify", question: resolved.question };
  }
  let universe = getRankedUniverse(ws);
  let target = getReferentialTarget(ws);
  if (resolved && !("ambiguous" in resolved)) {
    const subsetRef = /\b(those|them|these|from the|remaining)\b/i.test(text);
    const useResolvedPool =
      subsetRef ||
      isDiscoveryFollowUpQuery(text) ||
      ["research", "go_deeper", "compare", "remove"].includes(classified.intent);
    if (useResolvedPool) {
      universe = resolved.pool;
      target = resolved.pool;
    }
  }
  const named = resolveNamedGroup(ws, text);

  // --- GROUP REF ---
  if (classified.intent === "group_ref" && named?.length) {
    const line = symbolsLine(named);
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${line}`,
      intent: "group_ref",
      action: "research",
      targetSymbols: named.map((e) => e.symbol),
      note: `Context: resolved to named group (${line}).`,
    };
  }

  // --- DAY SWITCH ---
  if (classified.intent === "day_switch" && classified.day) {
    const cal = `What companies are reporting earnings on ${classified.day}?`;
    const withResearch =
      /\b(same|analy|research|do\s+the\s+same)\b/i.test(text) || ws.lastHandler === "research";
    return {
      kind: "rewrite",
      text: cal,
      intent: "day_switch",
      action: withResearch ? "calendar_then_research" : "calendar",
      note: `Context: switching universe to ${classified.day}${withResearch ? " and re-applying earnings research" : ""}.`,
    };
  }

  if (!universe.length && !target.length) {
    return {
      kind: "clarify",
      question:
        "I don't have an active ticker set from this conversation yet. Start with something like **What companies are reporting earnings on Monday?** or name tickers explicitly (e.g. `Analyze AAPL, MSFT`).",
    };
  }

  // Ambiguous multi-group
  if (
    /\b(those|them)\b/i.test(text) &&
    !named &&
    ws.groups.monday &&
    ws.groups.tuesday &&
    ws.active.length === 0
  ) {
    return {
      kind: "clarify",
      question: `Which set — **Monday** (${symbolsLine(ws.groups.monday, 6)}) or **Tuesday** (${symbolsLine(ws.groups.tuesday, 6)})?`,
    };
  }

  // --- WEAKEST EVIDENCE (remaining pool or current active) ---
  if (
    !classified.count &&
    /\b(weakest|worst|lowest)\b/i.test(text) &&
    (/\b(evidence|score|candidate)\b/i.test(text) || /\bwhich\b/i.test(text))
  ) {
    const pool = /\bremaining\b/i.test(text) ? resolveRemainingPool(ws) : target.length ? target : universe;
    if (pool.length) {
      const weakest = pool[pool.length - 1]!;
      return {
        kind: "reply",
        reply: formatWeakestEvidenceReply(weakest, pool),
        intent: "select",
        applyActive: pool,
        note: `Context: weakest evidence in pool → ${weakest.symbol}.`,
      };
    }
  }

  // --- SELECT (which three look strongest, focus on top 5, bottom 3, etc.) ---
  if (classified.intent === "select" && classified.count) {
    let source = universe.length ? universe : target;
    if (ws.lastHandler === "earnings_day" && ws.active.length >= classified.count) {
      source = ws.active;
    } else if (ws.lastUniverseLabel && ws.groups[ws.lastUniverseLabel.toLowerCase()]?.length) {
      source = ws.groups[ws.lastUniverseLabel.toLowerCase()]!;
    }
    if (/\b(those|the)\s+five\b/i.test(text) && ws.groups.top_5?.length) {
      source = ws.groups.top_5;
    } else if (/\b(those|them|these|from|remaining)\b/i.test(text) && target.length >= classified.count) {
      source = target;
    }
    const side = classified.selectSide ?? resolveSelectSide(text);
    const selected = pickRankedSlice(source, classified.count, side);
    const sideLabel = side === "bottom" ? "bottom" : "top";
    if (hasCachedScores(source)) {
      return {
        kind: "reply",
        reply: formatSelectionReply(selected, source.length, classified.count, side),
        intent: "select",
        applyActive: selected,
        note: `Context: selected ${sideLabel} ${classified.count} by prior partial-score ranking → ${symbolsLine(selected, classified.count)}. Active scope updated.`,
      };
    }
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${symbolsLine(source)}`,
      intent: "select",
      action: "rank",
      targetSymbols: source.map((e) => e.symbol),
      nextActive: selected,
      selectSide: side,
      note: `Context: ranking to select ${sideLabel} ${classified.count}; active scope will narrow after results.`,
    };
  }

  // --- RANK (show or refresh ranking) ---
  if (classified.intent === "rank") {
    if (hasCachedScores(universe) && !/\b(re-?run|refresh|update|again)\b/i.test(text)) {
      return {
        kind: "reply",
        reply: formatCachedRankReply(universe),
        intent: "rank",
        applyActive: universe,
        note: `Context: ranked ${universe.length} symbols from prior research (cached partial scores).`,
      };
    }
    const line = symbolsLine(universe);
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${line}`,
      intent: "rank",
      action: "research",
      targetSymbols: universe.map((e) => e.symbol),
      note: `Context: re-running research to rank ${universe.length} symbols.`,
    };
  }

  // --- GO DEEPER (always current active / last selection) ---
  if (classified.intent === "go_deeper") {
    let scope = target;
    const count = parseQuantity(text);
    if (count && universe.length) scope = universe.slice(0, count);
    else if (ws.groups.focus?.length) scope = ws.groups.focus;
    const line = symbolsLine(scope);
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${line}`,
      intent: "go_deeper",
      action: "research",
      targetSymbols: scope.map((e) => e.symbol),
      nextActive: scope,
      note: `Context: deeper research on current scope (${line}) — ${scope.length} symbol(s).`,
    };
  }

  // --- REMOVE ---
  if (classified.intent === "remove") {
    const source = target.length && ws.active.length <= (ws.groups.top_5?.length ?? ws.ranked.length)
      ? [...(ws.groups.top_5 ?? ws.groups.last_selection ?? target)]
      : [...universe];
    if (source.length < 2) {
      return {
        kind: "clarify",
        question: `Active set too small to remove one (${symbolsLine(source) || "empty"}).`,
      };
    }
    const removed = source[source.length - 1]!;
    const next = source.slice(0, -1);
    return {
      kind: "reply",
      reply: [
        "## Removal",
        "",
        `Removed **${removed.symbol}** (weakest ranked in the current group).`,
        "",
        `Remaining (${next.length}): **${symbolsLine(next)}**.`,
      ].join("\n"),
      intent: "remove",
      applyActive: next,
      note: `Context: removed ${removed.symbol} from group. Remaining: ${symbolsLine(next)}.`,
    };
  }

  // --- COMPARE (current active scope) ---
  if (classified.intent === "compare") {
    // Self-contained multi-ticker compares must keep the user's wording (e.g. margin trends).
    if (explicit.length >= 2) {
      return { kind: "passthrough", text };
    }
    const scope = target;
    const line = symbolsLine(scope, 6);
    return {
      kind: "rewrite",
      text: `Compare ${line}. Give me their current prices, RSI, next earnings dates and latest SEC filings. Tell me which is showing stronger momentum.`,
      intent: "compare",
      action: "compare",
      targetSymbols: scope.map((e) => e.symbol),
      note: `Context: comparing current scope (${line}).`,
    };
  }

  // --- RESEARCH (default for analyze them / those tickers) ---
  if (classified.intent === "research" || referential) {
    const scope = target.length && ws.active.length < ws.ranked.length ? target : universe.length ? universe : target;
    const line = symbolsLine(scope);
    const truncated = scope.length > CONTEXT_RESEARCH_MAX;
    return {
      kind: "rewrite",
      text: `Run earnings candidate research on ${line}`,
      intent: "research",
      action: "research",
      targetSymbols: scope.map((e) => e.symbol),
      note: truncated
        ? `Context: analyzing first ${CONTEXT_RESEARCH_MAX} of ${scope.length} in scope (${line}).`
        : `Context: analyzing ${scope.length} symbol(s) in current scope (${line}).`,
    };
  }

  return { kind: "passthrough", text };
}

/** Apply scope updates from a plan (reply or post-handler). */
export function applyPlanScopeUpdate(ws: ConversationWorkingSet, plan: ContextPlan): void {
  if (plan.kind === "reply") {
    applyActiveSubset(ws, plan.applyActive, plan.intent);
    return;
  }
  if (plan.kind !== "rewrite" || !plan.nextActive?.length) return;
  applyActiveSubset(ws, plan.nextActive, plan.intent);
}

export function withContextNote(reply: string, note?: string): string {
  if (!note?.trim()) return reply;
  return `_${note.trim()}_\n\n${reply}`;
}
