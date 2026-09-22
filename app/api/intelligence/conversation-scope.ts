/**
 * Unified conversation scope — what the user last saw drives follow-ups, not exact wording.
 *
 * Every assistant turn that returns tickers should call commitDisplayScope().
 * Referential / research follow-ups resolve via resolveOperationalScope() first.
 */

import { extractEarningsSessionFilter, isEarningsBoardSubsetFollowUp } from "../intelligence-data/earnings-day";
import type { ConversationWorkingSet, WorkingEntity } from "./conversation-context";
import { isNonImperativeResearchAsk } from "./intent";
import { isFreshMarketIntelligenceAsk } from "./market-intent";

export type DisplayScopeKind =
  | "earnings_calendar"
  | "earnings_session_slice"
  | "research"
  | "selection"
  | "data_reply"
  | "inferred_reply"
  | "other";

const TABLE_STOP = new Set([
  "AMC",
  "BMO",
  "DMH",
  "EPS",
  "ET",
  "US",
  "CSV",
  "COPY",
  "TABLE",
  "ROWS",
  "SOURCE",
  "FINNHUB",
]);

function entitiesFromSymbols(symbols: string[]): WorkingEntity[] {
  const seen = new Set<string>();
  const out: WorkingEntity[] = [];
  for (const raw of symbols) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol) || TABLE_STOP.has(symbol)) continue;
    seen.add(symbol);
    out.push({ symbol, rank: out.length + 1 });
  }
  return out;
}

function knownUniverseSymbols(ws: ConversationWorkingSet): Set<string> {
  const set = new Set<string>();
  for (const e of ws.ranked) set.add(e.symbol);
  for (const e of ws.active) set.add(e.symbol);
  for (const e of ws.displayScope ?? []) set.add(e.symbol);
  for (const list of Object.values(ws.groups)) {
    for (const e of list) set.add(e.symbol);
  }
  return set;
}

/** Record the ticker list the user actually saw in the last assistant message. */
export function commitDisplayScope(
  ws: ConversationWorkingSet,
  symbols: string[],
  kind: DisplayScopeKind,
  opts?: { syncActive?: boolean },
): void {
  const scoreLookup = new Map<string, WorkingEntity>();
  for (const e of [...ws.ranked, ...ws.active, ...(ws.displayScope ?? [])]) {
    scoreLookup.set(e.symbol, e);
  }
  const entities = entitiesFromSymbols(symbols).map((e, i) => {
    const prev = scoreLookup.get(e.symbol);
    return prev ? { ...prev, rank: i + 1 } : { ...e, rank: i + 1 };
  });
  if (!entities.length) return;
  ws.displayScope = entities;
  ws.displayScopeKind = kind;
  if (opts?.syncActive !== false) {
    ws.active = [...entities];
  }
  ws.updatedAt = Date.now();
}

/** When handlers omit meta, shrink scope from a subset table in the assistant reply. */
export function inferDisplayScopeFromAssistantReply(
  userText: string,
  assistantReply: string,
  ws: ConversationWorkingSet,
): WorkingEntity[] | null {
  const universe = knownUniverseSymbols(ws);
  if (universe.size < 2) return null;

  const found: string[] = [];
  for (const m of assistantReply.matchAll(/\b([A-Z][A-Z0-9]{0,4})\b/g)) {
    const s = m[1]!;
    if (TABLE_STOP.has(s) || !universe.has(s)) continue;
    found.push(s);
  }
  const uniq = [...new Set(found)];
  if (uniq.length === 0 || uniq.length >= universe.size) return null;

  const userNarrow =
    Boolean(extractEarningsSessionFilter(userText)) ||
    /\b(filter|only|narrow|slice|timing|keep|drop|exclude|remaining|leftover)\b/i.test(userText) ||
    isEarningsBoardSubsetFollowUp(userText, ws.lastHandler, ws.ranked.length);

  const replyClaimsSubset =
    /\b\d+\s+compan(y|ies)\b/i.test(assistantReply) ||
    /\btable\s*·\s*\d+\s+rows?\b/i.test(assistantReply) ||
    /\bafter\s+market\s+close\b/i.test(assistantReply);

  if (!userNarrow && !replyClaimsSubset) return null;
  return entitiesFromSymbols(uniq);
}

/**
 * Wording-agnostic: user is continuing prior desk work, not starting a fresh scan
 * and not naming a new explicit ticker list.
 */
export function isOperationalFollowUp(text: string, ws: ConversationWorkingSet): boolean {
  if (isFreshMarketIntelligenceAsk(text)) return false;
  if (isNonImperativeResearchAsk(text)) return true;

  const lower = text.toLowerCase();
  const hasState =
    (ws.displayScope?.length ?? 0) > 0 ||
    ws.ranked.length > 0 ||
    ws.active.length > 0 ||
    Object.keys(ws.groups).length > 0;
  if (!hasState) return false;

  if (
    /\b(rest|remaining|leftover|left|others|that set|that group|that list|that table|that lineup|what you (?:showed|listed|returned|gave)|from above|the above|same (?:ones|list|group|set)|prior (?:list|board|table)|last (?:list|table|board|message))\b/i.test(
      lower,
    )
  ) {
    return true;
  }
  if (/\b(those|them|these|both)\b/i.test(lower) && /\b(rank|ranking|sort|compare|which|top|bottom|strongest|weakest|remove|keep|only)\b/i.test(lower)) {
    return false;
  }

  if (
    /\b(dig|drill|deeper|analyze|analyse|research|break down|look at|run on|go into|expand|rev-?1|candidate)\b/i.test(
      lower,
    ) &&
    !/\b(?:on|for)\s+[A-Z]{2,5}(?:\s*,\s*[A-Z]{2,5})+\b/.test(text)
  ) {
    return true;
  }

  if (isEarningsSessionNarrowAsk(text, ws)) return true;

  return false;
}

/** Session filter on prior earnings board — phrasing-independent. */
export function isEarningsSessionNarrowAsk(text: string, ws: ConversationWorkingSet): boolean {
  const hasEarningsContext =
    ws.lastHandler === "earnings_day" ||
    ws.ranked.length > 0 ||
    (ws.displayScope?.length ?? 0) > 0 ||
    Object.keys(ws.groups).some((k) => /^(today|monday|tuesday|wednesday|thursday|friday)|earnings/.test(k));
  if (!hasEarningsContext) return false;

  const session = extractEarningsSessionFilter(text);
  if (!session) return false;

  return (
    isEarningsBoardSubsetFollowUp(text, ws.lastHandler, ws.ranked.length) ||
    /\b(filter|only|just|narrow|slice|timing|session|keep|drop|exclude|above|table|board|calendar|lineup|list)\b/i.test(
      text,
    )
  );
}

function sessionSubsetGroups(ws: ConversationWorkingSet): WorkingEntity[][] {
  return Object.keys(ws.groups)
    .filter((k) => /_(amc|bmo|dmh)$/i.test(k))
    .map((k) => ws.groups[k]!)
    .filter((g) => g.length > 0)
    .sort((a, b) => a.length - b.length);
}

/**
 * Single scope resolver for research / dig / "them" follow-ups.
 * Prefers last displayed list, then session slice, then narrowed active.
 */
function narrowedDisplayScope(ws: ConversationWorkingSet): WorkingEntity[] | null {
  const display = ws.displayScope ?? [];
  if (!display.length) return null;
  if (ws.displayScopeKind === "selection" || ws.displayScopeKind === "earnings_session_slice") {
    return display;
  }
  if (ws.displayScopeKind === "inferred_reply") return display;
  if (ws.ranked.length > 0 && display.length < ws.ranked.length) return display;
  return null;
}

export function resolveOperationalScope(
  ws: ConversationWorkingSet,
  text: string,
  fallbackTarget: WorkingEntity[],
  fallbackUniverse: WorkingEntity[],
): WorkingEntity[] {
  const followUp = isOperationalFollowUp(text, ws);

  const sessionSubsets = sessionSubsetGroups(ws);
  if (followUp && sessionSubsets.length) {
    const earningsish =
      ws.lastHandler === "earnings_day" ||
      ws.displayScopeKind?.startsWith("earnings") ||
      /\b(earnings|rev-?1|amc|bmo|remaining|tickers?)\b/i.test(text);
    if (earningsish) return sessionSubsets[0]!;
  }

  const narrowDisplay = narrowedDisplayScope(ws);
  if (followUp && narrowDisplay?.length) return narrowDisplay;

  if (ws.active.length > 0 && ws.ranked.length > 0 && ws.active.length < ws.ranked.length) {
    return ws.active;
  }
  if (ws.groups.focus?.length && ws.ranked.length > 0 && ws.groups.focus.length < ws.ranked.length) {
    return ws.groups.focus;
  }

  if (followUp && ws.displayScope?.length) return ws.displayScope;

  if (fallbackTarget.length) return fallbackTarget;
  return fallbackUniverse.length ? fallbackUniverse : ws.ranked.length ? ws.ranked : ws.active;
}
