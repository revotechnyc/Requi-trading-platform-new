import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { createStrategy, findAccountsByUser } from "./queries/trading";
import { confirmTicket, proposeTicket, rejectTicket } from "./queries/tickets";
import { agentChat, type AgentChatOptions, type MarketMeta } from "./intelligence/tools";
import { luciaPromptChat } from "./intelligence/lucia-prompt";
import { tryDeterministicDataReply } from "./intelligence/data-reply";
import {
  formatInternationalWaitReply,
  formatMemoryBypassRefusal,
  tryDiscoveryFollowUpReply,
  tryMarketIntelligenceReply,
} from "./intelligence/general-market";
import { formatMoversTopExplain } from "./intelligence/stock-discovery";
import {
  classifyConsoleResearchDepth,
  classifyMarketIntelligenceIntent,
  isDiscoveryFollowUpQuery,
  isDiscoveryRankExplainQuery,
  isInternationalMarketQuery,
  isMemoryBypassProbe,
  isConversationalTurn,
  isFreshMarketIntelligenceAsk,
} from "./intelligence/market-intent";
import { runRevision1Research } from "./intelligence/research/earnings-candidate";
import { runLivePriceConfirmationGate } from "./intelligence/research/live-price-gate";
import {
  acceptPromptLength,
  MAX_USER_PROMPT_CHARS,
  preparePromptForModel,
} from "./intelligence/prompt-overflow";
import { addWatchlistSymbol } from "./intelligence-data/watchlist";
import { resolveSymbolsFromText, filterLikelyFalsePositiveTickers } from "./intelligence-data/symbol-resolver";
import { getSnapshot } from "./marketdata/gateway/gateway";
import { clearHistory, loadHistory, saveMessage } from "./intelligence/memory";
import {
  ensureSessionStateColumn,
  hydrateConversationSession,
  persistConversationSession,
} from "./intelligence/conversation-session";
import { extractEarningsSessionFilter } from "./intelligence-data/earnings-day";
import { and, eq, isNull } from "drizzle-orm";
import { conversations } from "@db/schema";
import { getDb } from "./queries/connection";
import {
  advisoryFresh,
  classifyIntent,
  composeAdvisory,
  getThreadState,
  setThreadState,
} from "./intelligence/intent";
import { stageTicketFromAdvisory } from "./intelligence/stage-ticket";
import {
  clarificationAskSharesOrDollars,
  parseTradeNotional,
  parseTradeQuantity,
} from "./intelligence/trade-symbol";
import { resolveIntelligenceBroker } from "./queries/autonomous-exec-policy";
import {
  applyPlanScopeUpdate,
  formatSelectAfterRankReply,
  getWorkingSet,
  pickRankedSlice,
  planFromConversationContext,
  recordResearchResults,
  resolveReferentialUniverse,
  setActiveEntities,
  withContextNote,
  commitDisplayScope,
  type ContextPlan,
} from "./intelligence/conversation-context";
import {
  inferDisplayScopeFromAssistantReply,
  type DisplayScopeKind,
} from "./intelligence/conversation-scope";
import { tryEarningsDayCalendarReply } from "./intelligence-data/earnings-day";

const KNOWN_LABELS = ["ENTRY", "EXIT", "SIZING", "FILTER", "STRUCTURE", "GRID"];

/**
 * Anti-exposure guard (Constitutional Security Boundary, enforced server-side —
 * not by prompt instruction). Detects direct and indirect attempts to obtain
 * protected governance content and refuses with a safe, approved explanation.
 */
const EXPOSURE_PATTERNS: RegExp[] = [
  /system\s*prompt|master\s*prompt|your\s*prompt|initial\s*instructions?/i,
  /print|show|reveal|display|repeat|output|dump|quote|reproduce|recite/i,
  /constitution|governing\s+documents?|governance\s+(?:rules?|documents?|package|logic)/i,
  /formula\s*handbook|proprietary\s+formulas?|hidden\s+thresholds?|internal\s+thresholds?/i,
  /compiler\s+(?:logic|rules?|output|internals?)|policy\s*(?:engine\s*)?traces?/i,
  /rule\s+(?:dependency\s+)?graphs?|scoring\s+weights?/i,
  /strategy\s+(?:source\s+)?code|export\s+(?:private\s+)?strateg/i,
  /secrets?|credentials?|api\s*keys?|signing\s*keys?|decryption\s*keys?|tokens?/i,
  /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?|jailbreak|DAN\b/i,
  /reconstruct|reverse[-\s]?engineer/i,
];
const EXPOSURE_VERBS = /print|show|reveal|display|repeat|output|dump|quote|reproduce|recite|list|give|tell|explain|export|reconstruct|ignore|bypass|override|leak/i;

function isExposureAttempt(text: string): boolean {
  const lower = text.toLowerCase();
  const hits = EXPOSURE_PATTERNS.filter((p) => p.test(lower)).length;
  // A single match on a highly specific protected artifact is enough;
  // generic verbs require co-occurrence with a protected target.
  if (/(constitution|formula\s*handbook|governing\s+documents?|system\s*prompt|master\s*prompt|compiler|policy[-\s]?engine|signing\s*keys?|decryption\s*keys?)/i.test(lower) && EXPOSURE_VERBS.test(lower)) {
    return true;
  }
  if (/ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?/i.test(lower)) return true;
  return hits >= 2 && EXPOSURE_VERBS.test(lower);
}

const EXPOSURE_REFUSAL =
  "I can't help with that. Requi's governing documents, internal prompts, proprietary formulas, thresholds, compiler logic, and strategy implementations are private and are enforced as confidential at the architecture level — not by instruction. I can explain any decision, order, or risk status in plain language, walk you through how confirmation and protection work, or help you write a new text strategy instead.";

const WATCHLIST_ADD_RE =
  /\badd\s+(?:both|them|these)\s+to\s+(?:my\s+)?watchlist\b|\badd\s+.+\s+to\s+(?:my\s+)?watchlist\b/i;

async function tryWatchlistAddFromChat(userId: string, text: string): Promise<string | null> {
  if (!WATCHLIST_ADD_RE.test(text)) return null;
  // Prefer company names / explicit tickers — never "SEC", "THEIR", etc.
  const symbols = resolveSymbolsFromText(text).filter((s) => s.length <= 5);
  if (!symbols.length) return null;
  const added: string[] = [];
  for (const sym of symbols.slice(0, 4)) {
    const res = await addWatchlistSymbol(userId, sym);
    if (res.ok) added.push(res.symbol);
  }
  if (!added.length) return null;
  return `Added to your watchlist: **${added.join("**, **")}**. Background prefetch will track prices, news, filings, sentiment, and earnings.`;
}

export interface ParsedPlan {
  title: string;
  lines: { label: string; body: string }[];
  asset: "Stocks" | "Crypto" | "Options" | "Futures";
}

/** Deterministic parser for text-based strategies (ENTRY / EXIT / SIZING …). */
export function parseStrategyText(text: string): ParsedPlan | null {
  const raw = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (raw.length < 2) return null;
  const lines: { label: string; body: string }[] = [];
  for (const l of raw) {
    const m = l.match(/^([A-Z ]{3,12}):\s*(.+)$/);
    if (m && KNOWN_LABELS.includes(m[1].trim())) {
      lines.push({ label: m[1].trim(), body: m[2] });
    }
  }
  if (lines.length === 0) return null;
  const lower = text.toLowerCase();
  const asset: ParsedPlan["asset"] =
    lower.includes("btc") || lower.includes("eth") || lower.includes("crypto")
      ? "Crypto"
      : lower.includes("condor") || lower.includes("strangle") || lower.includes("option") || lower.includes("spx")
        ? "Options"
        : /\bES1?!?\b/.test(text) || lower.includes("futures") || /\bNQ1?!?\b/.test(text)
          ? "Futures"
          : "Stocks";
  return { title: raw[0].replace(/\.$/, ""), lines, asset };
}

/**
 * Optional OpenAI-backed parsing. Active only when OPENAI_API_KEY is set;
 * otherwise the deterministic parser above is used (still fully functional).
 */
async function openAiParse(text: string): Promise<ParsedPlan | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6";
  const usesCompletionTokens = /^(gpt-5|o[1-9])/i.test(model);
  const body: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'Parse the trading strategy into JSON: {"title": string, "asset": "Stocks"|"Crypto"|"Options"|"Futures", "lines": [{"label": "ENTRY"|"EXIT"|"SIZING"|"FILTER"|"STRUCTURE"|"GRID", "body": string}]}. Only include labels present in the text. Return only JSON.',
      },
      { role: "user", content: text },
    ],
  };
  if (usesCompletionTokens) {
    body.max_completion_tokens = 600;
    body.reasoning_effort = /^o[1-9]/i.test(model) ? "low" : "none";
  } else {
    body.max_tokens = 600;
    body.temperature = 0.2;
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[intelligence] openAiParse HTTP", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "null");
    if (!parsed?.lines?.length) return null;
    return { title: parsed.title ?? "Untitled strategy", lines: parsed.lines, asset: parsed.asset ?? "Stocks" };
  } catch {
    return null;
  }
}

/**
 * The general chat path lives in api/intelligence/tools.ts (agentChat):
 * single-shot LLM calls were replaced by the tool-use reasoning loop with
 * live state injection — see that module for stages 1–4.
 */

export const intelligenceRouter = createRouter({
  /** Conversation memory: recent exchanges for the signed-in user. */
  history: authedQuery.query(async ({ ctx }) => loadHistory(ctx.user.id, 50)),

  /** Forget the conversation (memory is per-user; clearing affects no one else). */
  clearHistory: authedQuery.mutation(async ({ ctx }) => clearHistory(ctx.user.id)),

  chat: authedQuery
    .input(z.object({ text: z.string().min(1).max(MAX_USER_PROMPT_CHARS), conversationId: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const lengthCheck = acceptPromptLength(input.text);
      if (!lengthCheck.ok) {
        return { kind: "text" as const, reply: `⛔ ${lengthCheck.error}`, conversationId: input.conversationId ?? null };
      }
      const conversationId = await ensureConversation(ctx.user.id, input.conversationId, input.text);
      const result = await runIntelligenceChat(ctx.user, input.text, conversationId);
      return { ...result, conversationId };
    }),
});

/**
 * Create-or-verify the conversation a chat turn belongs to. A missing id
 * starts a new conversation titled from the first message; an id that does
 * not belong to the caller is rejected (never write across users).
 */
export async function ensureConversation(userId: string, conversationId: string | undefined, firstText: string): Promise<string> {
  await ensureSessionStateColumn();
  const db = getDb();
  if (conversationId) {
    const owned = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId), isNull(conversations.deletedAt)))
      .limit(1);
    if (owned[0]) return conversationId;
  }
  const title = firstText.replace(/\s+/g, " ").trim().slice(0, 80) || "Conversation";
  const [row] = await db.insert(conversations).values({ userId, title }).returning({ id: conversations.id });
  return row.id;
}

/**
 * Headless executor for the Intelligence pipeline — shared by the chat
 * mutation above and the scheduled-task runner. The `ctx` shim keeps the
 * battle-tested body below byte-identical to the original inline mutation.
 */
export async function runIntelligenceChat(
  user: { id: string },
  rawText: string,
  conversationId?: string,
): Promise<{ kind: string; reply?: string; [k: string]: unknown }> {
  const ctx = { user };
  const text = rawText.trim();
  const contextEnabled =
    process.env.CONVERSATION_CONTEXT !== "off" && Boolean(conversationId?.trim());
  if (contextEnabled && conversationId) {
    await hydrateConversationSession(user.id, conversationId).catch((e) => {
      console.error("[intelligence] hydrateConversationSession", e);
    });
  }
  const workingSet = contextEnabled ? getWorkingSet(user.id, conversationId) : getWorkingSet(user.id, undefined);
  let contextNote: string | undefined;
  let pendingScope: ContextPlan | null = null;

  try {
  // Persist every turn to the conversation (deterministic paths bypass
  // agentChat, which no longer saves — persistence is centralized here so
  // Recent Conversations always has the full thread).
  if (conversationId) await saveMessage(user.id, "user", text, conversationId);

  // Pack G1 — refuse memory-only market / buy probes before any LLM path.
  if (isMemoryBypassProbe(text)) {
    const reply = formatMemoryBypassRefusal();
    if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
    return { kind: "text" as const, reply };
  }

  // Pack A2 — international markets; honest WAIT (never US-default substitute).
  if (isInternationalMarketQuery(text)) {
    const reply = formatInternationalWaitReply(text);
    if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
    return { kind: "text" as const, reply };
  }

  const chitchatTurn = isConversationalTurn(text);

  // Console chips + fresh market scans — run engine before Rev-1 context can hijack.
  if (isFreshMarketIntelligenceAsk(text)) {
    const marketFresh = await tryMarketIntelligenceReply(user.id, text).catch(() => null);
    if (marketFresh) {
      if (contextEnabled && marketFresh.rankedResults?.length) {
        const isDiscovery = /stock-discovery/i.test(marketFresh.meta.sourceName ?? "");
        const isMovers = /market-movers/i.test(marketFresh.meta.sourceName ?? "");
        if (isDiscovery || isMovers) {
          recordResearchResults(
            workingSet,
            marketFresh.rankedResults.map((r) => ({
              symbol: r.symbol,
              rawScore: r.rawScore,
              classification: r.classification ?? undefined,
            })),
            { groupLabel: isDiscovery ? "stock_discovery" : "market_movers" },
          );
        }
      }
      if (conversationId) await saveMessage(user.id, "assistant", marketFresh.reply, conversationId);
      return { kind: "text" as const, reply: marketFresh.reply, marketMeta: marketFresh.meta };
    }
  }

  // Referential market follow-ups — resolve topic before select/research context runs.
  if (contextEnabled) {
    const resolved = resolveReferentialUniverse(text, workingSet);
    if (resolved && "ambiguous" in resolved && resolved.ambiguous) {
      if (conversationId) await saveMessage(user.id, "assistant", resolved.question, conversationId);
      return { kind: "text" as const, reply: resolved.question };
    }
    if (isDiscoveryFollowUpQuery(text)) {
      const discoveryPool = workingSet.groups.stock_discovery;
      const moversPool = workingSet.groups.market_movers;
      if (
        resolved &&
        !("ambiguous" in resolved) &&
        resolved.label === "market_movers" &&
        isDiscoveryRankExplainQuery(text) &&
        moversPool?.length
      ) {
        const moversExplain = formatMoversTopExplain(moversPool);
        const reply = withContextNote(
          moversExplain,
          `Context: referring to **today's movers scan** (${moversPool.map((e) => e.symbol).join(", ")}) — not discovery candidates.`,
        );
        if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
        return { kind: "text" as const, reply };
      }
      if (!discoveryPool?.length) {
        const reply = withContextNote(
          [
            "I don't have a **stock discovery** list in this chat yet.",
            "",
            "Ask e.g. `What should I buy today?` first — then you can follow up with `Why is the top one ranked first?` or `Which of those is riskiest?` on that ranked list.",
            "",
            "_Movers and discovery are separate lists — rank/risk follow-ups refer to discovery, not today's gainers/losers scan._",
          ].join("\n"),
          "Context: discovery follow-up without a prior stock-discovery run.",
        );
        if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
        return { kind: "text" as const, reply };
      }
      const discoveryFollowUp = await tryDiscoveryFollowUpReply(
        user.id,
        text,
        discoveryPool,
        "stock_discovery",
      ).catch(() => null);
      if (discoveryFollowUp) {
        if (discoveryFollowUp.rankedResults?.length) {
          recordResearchResults(
            workingSet,
            discoveryFollowUp.rankedResults.map((r) => ({
              symbol: r.symbol,
              rawScore: r.rawScore,
              classification: r.classification ?? undefined,
            })),
            { groupLabel: "stock_discovery" },
          );
        }
        const reply = withContextNote(
          discoveryFollowUp.reply,
          `Context: referring to **buy / discovery candidates** (${discoveryPool.map((e) => e.symbol).join(", ")}) — not whichever list ran last.`,
        );
        if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
        return { kind: "text" as const, reply };
      }
    }
  }

  // Referential follow-ups → intent → entity resolution → scope → action.
  const contextPlan = contextEnabled
    ? planFromConversationContext(text, workingSet)
    : ({ kind: "passthrough", text } as ContextPlan);

  if (contextPlan.kind === "clarify") {
    if (conversationId) await saveMessage(user.id, "assistant", contextPlan.question, conversationId);
    return { kind: "text" as const, reply: contextPlan.question };
  }

  if (contextPlan.kind === "reply") {
    applyPlanScopeUpdate(workingSet, contextPlan);
    const reply = withContextNote(contextPlan.reply, contextPlan.note);
    if (conversationId) await saveMessage(user.id, "assistant", reply, conversationId);
    return { kind: "text" as const, reply };
  }

  let effectiveText = text;
  if (contextPlan.kind === "rewrite") {
    effectiveText = contextPlan.text;
    contextNote = contextPlan.note;
    pendingScope = contextPlan;
  }

  // Gateway market meta (source/staleness) rides back to the UI chip whenever
  // a model turn resolved symbols through the Market Data Gateway.
  let marketMeta: MarketMeta | null = null;
  const withMarket = (o: AgentChatOptions): AgentChatOptions => ({
    ...o,
    onMarketMeta: (m) => {
      marketMeta = m;
    },
  });

  const rememberFromMeta = (
    handler: "earnings_day" | "research" | "data_reply" | "live_gate" | "other",
    symbols: string[],
    groupLabel?: string,
    researchResults?: Array<{ symbol: string; rawScore?: number | null; classification?: string }>,
  ) => {
    // Never let English nouns from trader NL (RISK, BUYING, ABOVE, …) poison the working set.
    const cleaned = filterLikelyFalsePositiveTickers(
      symbols.map((s) => s.toUpperCase()),
      effectiveText,
    );
    if (!cleaned.length || !contextEnabled) return;
    const label =
      groupLabel ??
      (effectiveText.match(
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i,
      )?.[1]?.toLowerCase() ||
        workingSet.lastUniverseLabel);

    if (handler === "earnings_day") {
      const session = extractEarningsSessionFilter(effectiveText);
      const baseLabel =
        label ??
        effectiveText.match(
          /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i,
        )?.[1]?.toLowerCase() ??
        "earnings";
      const groupLabel = session ? `${baseLabel}_${session.toLowerCase()}` : baseLabel;
      recordResearchResults(
        workingSet,
        cleaned.map((symbol, i) => ({
          symbol,
          rawScore: cleaned.length - i,
          classification: "EARNINGS",
        })),
        { groupLabel, lastHandler: "earnings_day" },
      );
      return;
    }

    if (handler === "research" && researchResults?.length) {
      const safeResearch = researchResults.filter(
        (r) => filterLikelyFalsePositiveTickers([r.symbol], effectiveText).length > 0,
      );
      if (safeResearch.length) {
        recordResearchResults(workingSet, safeResearch, { groupLabel: label });
      } else {
        setActiveEntities(workingSet, cleaned, {
          handler,
          groupLabel: label,
          asRanked: true,
        });
      }
    } else {
      setActiveEntities(workingSet, cleaned, {
        handler,
        groupLabel: label,
        asRanked: handler === "research",
      });
    }

    if (pendingScope?.kind === "rewrite") {
      if (pendingScope.nextActive?.length) {
        if (pendingScope.action === "rank" && handler === "research" && researchResults?.length) {
          const n = pendingScope.nextActive.length;
          const side = pendingScope.selectSide ?? "top";
          const picked = pickRankedSlice(researchResults, n, side).map((r) => ({
            symbol: r.symbol,
            score: r.rawScore ?? null,
            classification: r.classification ?? null,
          }));
          applyPlanScopeUpdate(workingSet, {
            kind: "reply",
            reply: "",
            intent: "select",
            applyActive: picked,
          });
        } else {
          applyPlanScopeUpdate(workingSet, pendingScope);
        }
      }
    }
  };

  /**
   * Prefer stored OpenAI prompt (Responses + OPENAI_PROMPT_ID) like the live
   * app. Fall back to swarm agentChat (function tools) when prompt id is
   * unset or Responses returns empty. Write-tool turns always use agentChat.
   */
  async function conversationalReply(
    userText: string,
    options: AgentChatOptions & { developerExtra?: string } = {},
  ): Promise<string | null> {
    if (options.allowTradeTool) {
      return agentChat(ctx.user.id, userText, withMarket(options));
    }

    // Calendar → then research (methodology carry-forward: "same for Tuesday")
    if (pendingScope?.kind === "rewrite" && pendingScope.action === "calendar_then_research") {
      const cal = await tryEarningsDayCalendarReply(userText).catch(() => null);
      if (cal?.meta.symbols?.length) {
        rememberFromMeta("earnings_day", cal.meta.symbols);
        const line = cal.meta.symbols.slice(0, 12).join(", ");
        const research = await runRevision1Research(
          ctx.user.id,
          `Run earnings candidate research on ${line}`,
        ).catch((e) => {
          console.error("[intelligence] revision1 research failed", e);
          return null;
        });
        if (research) {
          marketMeta = {
            symbols: research.symbols,
            source: "finnhub",
            sourceName: "Revision 1 research (Finnhub + gateway)",
            stale: false,
            timestamp: new Date().toISOString(),
          };
          rememberFromMeta("research", research.symbols, undefined, research.rankedResults);
          return withContextNote(`${cal.reply}\n\n---\n\n${research.reply}`, contextNote);
        }
        marketMeta = cal.meta;
        return withContextNote(
          `${cal.reply}\n\n_Calendar loaded into active set (${line}). Research could not complete — retry with "Analyze those tickers."_`,
          contextNote,
        );
      }
    }

    // Revision 1 research protocols — deterministic retrieve/calc/gap report first.
    if (!options.skipDeterministicLayers && !options.advisory && !options.developerExtra) {
      const liveGate = await runLivePriceConfirmationGate(ctx.user.id, userText).catch((e) => {
        console.error("[intelligence] live price gate failed", e);
        return null;
      });
      if (liveGate) {
        marketMeta = {
          symbols: liveGate.symbols,
          source: liveGate.meta.source,
          sourceName: liveGate.meta.sourceName,
          stale: liveGate.meta.stale,
          timestamp: liveGate.meta.timestamp,
        };
        rememberFromMeta("live_gate", liveGate.symbols);
        return withContextNote(liveGate.reply, contextNote);
      }
      const research = await runRevision1Research(ctx.user.id, userText).catch((e) => {
        console.error("[intelligence] revision1 research failed", e);
        return null;
      });
      if (research) {
        const selectAfterRank =
          pendingScope?.kind === "rewrite" &&
          pendingScope.action === "rank" &&
          pendingScope.intent === "select" &&
          (pendingScope.nextActive?.length ?? 0) > 0 &&
          (research.rankedResults?.length ?? 0) > 0;

        const selectCount = selectAfterRank ? pendingScope.nextActive!.length : 0;
        const selectSide =
          selectAfterRank && pendingScope.kind === "rewrite"
            ? (pendingScope.selectSide ?? "top")
            : "top";
        const selectSymbols = selectAfterRank
          ? pickRankedSlice(research.rankedResults!, selectCount, selectSide).map((r) => r.symbol)
          : research.symbols;

        marketMeta = {
          symbols: selectSymbols,
          source: "finnhub",
          sourceName: selectAfterRank
            ? "Selection after rank (Revision 1 partial scores)"
            : "Revision 1 research (Finnhub + gateway)",
          stale: false,
          timestamp: new Date().toISOString(),
        };
        rememberFromMeta("research", research.symbols, undefined, research.rankedResults);

        if (selectAfterRank) {
          // Phase 3 MT-001: narrow UX — selection table only; full cards on "Go deeper".
          return withContextNote(
            formatSelectAfterRankReply(research.rankedResults!, selectCount, selectSide),
            contextNote,
          );
        }
        return withContextNote(research.reply, contextNote);
      }
      const deterministic = await tryDeterministicDataReply(ctx.user.id, userText).catch(() => null);
      if (deterministic) {
        marketMeta = deterministic.meta;
        const isCalendar = /finnhub/i.test(deterministic.meta.sourceName ?? "") ||
          /quarterly earnings/i.test(deterministic.reply);
        const isDiscovery = /stock-discovery/i.test(deterministic.meta.sourceName ?? "");
        const isMovers = /market-movers/i.test(deterministic.meta.sourceName ?? "");
        if (isCalendar) {
          rememberFromMeta(
            "earnings_day",
            deterministic.rankedResults?.map((r) => r.symbol) ?? deterministic.meta.symbols ?? [],
            effectiveText.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\b/i)?.[1]?.toLowerCase(),
          );
        } else if (isDiscovery || isMovers) {
          rememberFromMeta(
            "research",
            deterministic.rankedResults?.map((r) => r.symbol) ?? deterministic.meta.symbols ?? [],
            isDiscovery ? "stock_discovery" : "market_movers",
            deterministic.rankedResults?.map((r) => ({
              symbol: r.symbol,
              rawScore: r.rawScore,
              classification: r.classification ?? undefined,
            })),
          );
        }
        return withContextNote(deterministic.reply, contextNote);
      }
    }

    // Long-prompt overflow: never truncate — package as attachment blocks for the model.
    const prepared = preparePromptForModel(userText);
    const overflowNote = prepared.overflow
      ? `Prompt overflow active: attachment_id=${prepared.attachmentId}, chars=${prepared.originalText.length}, ~${prepared.estimatedTokens} tokens. Full protocol is in developer attachment blocks.`
      : undefined;
    const activeHint =
      workingSet.active.length > 0
        ? `=== CONVERSATION WORKING SET (deterministic context — resolve "those/them" to these tickers when the user is referential) ===\nActive: ${workingSet.active.map((e) => e.symbol).join(", ")}\nRanked: ${workingSet.ranked.map((e) => e.symbol).join(", ") || "(same)"}\nGroups: ${Object.keys(workingSet.groups).join(", ") || "(none)"}`
        : undefined;
    const developerExtra = [options.developerExtra, overflowNote, activeHint, ...prepared.attachmentBlocks]
      .filter(Boolean)
      .join("\n\n");

    const lucia = await luciaPromptChat(ctx.user.id, prepared.modelUserText, {
      conversationId: options.conversationId ?? conversationId,
      developerExtra: developerExtra || undefined,
    });
    if (lucia?.reply) {
      if (lucia.marketMeta) marketMeta = lucia.marketMeta;
      return withContextNote(lucia.reply, contextNote);
    }
    return agentChat(ctx.user.id, prepared.modelUserText, withMarket({
      ...options,
      developerExtra: developerExtra || options.developerExtra,
      attachmentBlocks: prepared.attachmentBlocks,
    }));
  }

  const result = await (async (): Promise<{ kind: string; reply?: string; [k: string]: unknown }> => {


      // 0) anti-exposure guard — architectural confidentiality, checked first
      if (isExposureAttempt(text)) {
        return { kind: "text" as const, reply: EXPOSURE_REFUSAL };
      }

      // 0b) Client Rev 9/14 — market intelligence before trade intent can misread TODAY as a ticker.
      if (classifyMarketIntelligenceIntent(effectiveText)) {
        const marketEarly = await tryMarketIntelligenceReply(ctx.user.id, effectiveText).catch(() => null);
        if (marketEarly) {
          marketMeta = marketEarly.meta;
          const isDiscovery = /stock-discovery/i.test(marketEarly.meta.sourceName ?? "");
          const isMovers = /market-movers/i.test(marketEarly.meta.sourceName ?? "");
          if (isDiscovery || isMovers) {
            rememberFromMeta(
              "research",
              marketEarly.rankedResults?.map((r) => r.symbol) ?? marketEarly.meta.symbols ?? [],
              isDiscovery ? "stock_discovery" : "market_movers",
              marketEarly.rankedResults?.map((r) => ({
                symbol: r.symbol,
                rawScore: r.rawScore,
                classification: r.classification ?? undefined,
              })),
            );
          }
          return {
            kind: "text" as const,
            reply: withContextNote(marketEarly.reply, contextNote),
          };
        }
        // Console chips must never fall through to free-form Lucia (portfolio/chart refusals).
        const consoleDepth = classifyConsoleResearchDepth(effectiveText);
        if (consoleDepth) {
          return {
            kind: "text" as const,
            reply: withContextNote(
              [
                "I tried to run the live US opportunity scan, but market data did not come back cleanly on this pass.",
                "",
                "Status: **WAIT** — I will not invent tickers, probabilities, or expected value without verified quotes.",
                "Please try the chip again in a moment; no portfolio or chart upload is required for this research.",
              ].join("\n"),
              contextNote,
            ),
          };
        }
      }

      // 1) confirmation-gate commands — CONFIRM/REJECT ORDER [TICKET_ID]
      const confirmMatch = text.match(/^CONFIRM ORDER ([A-Za-z0-9-]+)$/i);
      if (confirmMatch) {
        const res = await confirmTicket(ctx.user.id, confirmMatch[1], text);
        return {
          kind: "text" as const,
          reply: res.ok
            ? `✅ ${res.message}\n\nTicket ${confirmMatch[1].toUpperCase()} — ${res.ticket?.state ?? "submitted"}. You'll get execution alerts as the broker reports.`
            : `⛔ ${res.message}\n\nReason code: ${res.reasonCode}`,
        };
      }
      const rejectMatch = text.match(/^REJECT ORDER ([A-Za-z0-9-]+)$/i);
      if (rejectMatch) {
        const res = await rejectTicket(ctx.user.id, rejectMatch[1]);
        return { kind: "text" as const, reply: res.ok ? `🚫 ${res.message}` : `⛔ ${res.message}` };
      }

      // 2) INTENT ROUTER — the deterministic switch between the AI model
      //    (conversation / reasoning / research) and the deterministic engine
      //    (analyze → protocol check → advisory → staged ticket).
      //    The model is NEVER the router. Rollback: INTENT_ROUTER=off.
      const routerOn = process.env.INTENT_ROUTER !== "off";

      if (routerOn) {
        const thread = getThreadState(ctx.user.id, conversationId);
        const intent = classifyIntent(effectiveText, thread);

        // Size-clarification reply after "Buy Apple" (Message 2) — may be CHAT mode ("100 shares").
        if (thread.awaitingQuantityFor && intent.mode !== "TRADE_INTENT") {
          const awaiting = thread.awaitingQuantityFor;
          const qtyParsed = parseTradeQuantity(text);
          const notionalParsed = parseTradeNotional(text);
          if (qtyParsed.error) return { kind: "text" as const, reply: qtyParsed.error };
          if (notionalParsed.error) return { kind: "text" as const, reply: notionalParsed.error };

          let resolvedQty = qtyParsed.quantity;
          if (resolvedQty == null && notionalParsed.notional != null) {
            const snapForSize = await getSnapshot(ctx.user.id, awaiting.symbol).catch(() => null);
            const px =
              snapForSize?.market_data_available && snapForSize.price > 0 ? snapForSize.price : null;
            if (px == null) {
              return {
                kind: "text" as const,
                reply:
                  `I heard **$${notionalParsed.notional.toLocaleString()}** for **${awaiting.symbol}**, but I don't have a verified last price to convert dollars → shares.\n\n` +
                  `Please reply with a **share count** (e.g. \`100 shares\`). Nothing was staged.`,
              };
            }
            resolvedQty = Math.max(1, Math.floor(notionalParsed.notional / px));
          }

          if (resolvedQty == null) {
            return {
              kind: "text" as const,
              reply: clarificationAskSharesOrDollars(awaiting.symbol, awaiting.side),
            };
          }

          // Run advisory with clarified size (same path as sized TRADE_INTENT).
          const snap = await getSnapshot(ctx.user.id, awaiting.symbol).catch(() => null);
          if (!snap?.market_data_available) {
            const reason = snap && "reason" in snap ? snap.reason : "no market data available";
            return {
              kind: "text" as const,
              reply:
                `I can't verify **${awaiting.symbol}** as a tradable symbol — ${reason ?? "invalid ticker"}.\n\nNothing was staged.`,
            };
          }
          try {
            const advisory = await composeAdvisory(ctx.user.id, awaiting.symbol, awaiting.side);
            setThreadState(
              ctx.user.id,
              {
                advisory,
                pendingQuantity: resolvedQty,
                awaitingQuantityFor: null,
              },
              conversationId,
            );
            const stageHint =
              advisory.verdict === "FAVORABLE"
                ? `If you want to proceed, say "stage it" and I'll prepare a ticket — nothing trades without your CONFIRM.`
                : advisory.verdict === "WAIT"
                  ? `Verdict is **WAIT** — I will not stage a ticket until the setup is **FAVORABLE**. Nothing was staged.`
                  : `Nothing was staged.`;
            const narrated =
              advisory.verdict === "FAVORABLE"
                ? await conversationalReply(text, {
                    allowTradeTool: false,
                    advisory,
                    conversationId,
                    developerExtra:
                      `=== ADVISORY (deterministic engine verdict — narrate it faithfully, never invent or alter its numbers) ===\n` +
                      `${JSON.stringify(advisory)}\nUser-requested quantity: ${resolvedQty} shares.\n` +
                      `Tell the user they can say "stage it" to prepare a ticket. Nothing trades without CONFIRM.`,
                  })
                : null;
            if (narrated) return { kind: "text" as const, reply: narrated };
            return {
              kind: "text" as const,
              reply:
                `**${advisory.symbol} ${advisory.side} — verdict: ${advisory.verdict}** · size **${resolvedQty}** shares\n\n` +
                advisory.reasons.map((r) => `· ${r}`).join("\n") +
                (advisory.proposed?.lastPrice != null
                  ? `\n\nLast price: $${advisory.proposed.lastPrice}` +
                    (advisory.proposed.note ? ` · ${advisory.proposed.note}` : "")
                  : "") +
                (advisory.watchFor ? `\n\nWatch for: ${advisory.watchFor}` : "") +
                `\n\n${stageHint}`,
            };
          } catch (e) {
            return {
              kind: "text" as const,
              reply: `I couldn't complete the market check for ${awaiting.symbol}: ${(e as Error).message}. Nothing was staged.`,
            };
          }
        }

        if (intent.mode === "TRADE_INTENT") {
          if (intent.quantityError) {
            return { kind: "text" as const, reply: intent.quantityError };
          }

          // 2a) "stage it" on a FRESH advisory → deterministic proposeTicket
          if (intent.followUp && advisoryFresh(thread.advisory)) {
            const staged = await stageTicketFromAdvisory(ctx.user.id, thread.advisory!, {
              quantity: intent.quantity ?? thread.pendingQuantity ?? undefined,
              conversationId,
            });
            return { kind: "text" as const, reply: staged.reply };
          }

          if (!intent.symbol) {
            return {
              kind: "text" as const,
              reply:
                "Which symbol? Tell me the ticker (e.g. \"buy AAPL\") and I'll run it through market analysis and our protocol before anything is staged.",
            };
          }

          // Message 2: bare "Buy Apple" / "Buy AAPL" with no size → ask shares vs dollars
          const notionalSameTurn = parseTradeNotional(text);
          if (notionalSameTurn.error) {
            return { kind: "text" as const, reply: notionalSameTurn.error };
          }
          if (intent.quantity == null && notionalSameTurn.notional == null && !intent.followUp) {
            setThreadState(
              ctx.user.id,
              {
                awaitingQuantityFor: { symbol: intent.symbol, side: intent.side ?? "BUY" },
                pendingQuantity: null,
                advisory: null,
              },
              conversationId,
            );
            return {
              kind: "text" as const,
              reply: clarificationAskSharesOrDollars(intent.symbol, intent.side ?? "BUY"),
            };
          }

          const snap = await getSnapshot(ctx.user.id, intent.symbol).catch(() => null);
          if (!snap?.market_data_available) {
            const reason = snap && "reason" in snap ? snap.reason : "no market data available";
            return {
              kind: "text" as const,
              reply:
                `I can't verify **${intent.symbol}** as a tradable symbol — ${reason ?? "invalid ticker"}.\n\nNothing was staged. Please use a valid ticker (e.g. AAPL, TSLA).`,
            };
          }

          let tradeQty = intent.quantity;
          if (tradeQty == null && notionalSameTurn.notional != null) {
            if (!(snap.price > 0)) {
              setThreadState(
                ctx.user.id,
                {
                  awaitingQuantityFor: { symbol: intent.symbol, side: intent.side ?? "BUY" },
                  pendingQuantity: null,
                },
                conversationId,
              );
              return {
                kind: "text" as const,
                reply:
                  `I heard **$${notionalSameTurn.notional.toLocaleString()}** for **${intent.symbol}**, but I don't have a verified last price to convert dollars → shares.\n\n` +
                  clarificationAskSharesOrDollars(intent.symbol, intent.side ?? "BUY"),
              };
            }
            tradeQty = Math.max(1, Math.floor(notionalSameTurn.notional / snap.price));
          }

          try {
            const advisory = await composeAdvisory(ctx.user.id, intent.symbol, intent.side ?? "BUY");
            setThreadState(
              ctx.user.id,
              {
                advisory,
                pendingQuantity: tradeQty,
                awaitingQuantityFor: null,
              },
              conversationId,
            );
            const stageHint =
              advisory.verdict === "FAVORABLE"
                ? `If you want to proceed, say "stage it" and I'll prepare a ticket — nothing trades without your CONFIRM.`
                : advisory.verdict === "WAIT"
                  ? `Verdict is **WAIT** — I will not stage a ticket until the setup is **FAVORABLE**. Nothing was staged.`
                  : `Nothing was staged.`;
            // Only FAVORABLE may be narrated by Lucia with a stage invite; WAIT/others stay deterministic
            // so the model cannot invite "stage it" against client rules.
            if (advisory.verdict === "FAVORABLE") {
              const narrated = await conversationalReply(text, {
                allowTradeTool: false,
                advisory,
                conversationId,
                developerExtra:
                  `=== ADVISORY (deterministic engine verdict — narrate it faithfully, never invent or alter its numbers) ===\n` +
                  `${JSON.stringify(advisory)}\n` +
                  (tradeQty != null ? `User-requested quantity: ${tradeQty} shares.\n` : "") +
                  `Tell the user they can say "stage it" to prepare a ticket. Nothing trades without CONFIRM.`,
              });
              if (narrated) return { kind: "text" as const, reply: narrated };
            }
            const a = advisory;
            return {
              kind: "text" as const,
              reply:
                `**${a.symbol} ${a.side} — verdict: ${a.verdict}**` +
                (tradeQty != null ? ` · size **${tradeQty}** shares` : "") +
                `\n\n` +
                a.reasons.map((r) => `· ${r}`).join("\n") +
                (a.proposed?.lastPrice != null
                  ? `\n\nLast price: $${a.proposed.lastPrice}` +
                    (a.proposed.note ? ` · ${a.proposed.note}` : "")
                  : "") +
                (a.watchFor ? `\n\nWatch for: ${a.watchFor}` : "") +
                `\n\n${stageHint}`,
            };
          } catch (e) {
            return {
              kind: "text" as const,
              reply: `I couldn't complete the market check for ${intent.symbol}: ${(e as Error).message}. Nothing was staged.`,
            };
          }
        }

        if (intent.mode === "STRATEGIZE") {
          // falls through to the deterministic strategy-builder branch below
        } else {
          const watchlistReply = await tryWatchlistAddFromChat(ctx.user.id, text);
          // Cross-feature queries (compare + prices + RSI + …) must not stop at watchlist-only.
          const dataHeavy =
            /\b(compare|prices?|rsi|news|sentiment|earnings|filing|filings|momentum|sec)\b/i.test(text);

          if (watchlistReply && !dataHeavy) {
            return { kind: "text" as const, reply: watchlistReply };
          }

          // CHAT / STATUS_QUERY → stored prompt (Lucia) first, then swarm tools.
          // Use effectiveText so referential follow-ups ("analyze those") hit deterministic handlers.
          const reply = await conversationalReply(effectiveText, {
            allowTradeTool: false,
            conversationId,
            skipDeterministicLayers: chitchatTurn,
          });
          if (reply && watchlistReply) {
            return { kind: "text" as const, reply: `${reply}\n\n${watchlistReply}` };
          }
          if (reply) return { kind: "text" as const, reply };
          if (watchlistReply) return { kind: "text" as const, reply: watchlistReply };
        }
      } else {
        // LEGACY path (INTENT_ROUTER=off): natural-language trade proposal → staged ticket
        const tradeMatch = text.match(/^(buy|sell)\s+(\d+)\s+([A-Za-z.]{1,12})(?:\s+(?:at|@)\s+(\d+(?:\.\d+)?))?(?:\s+(limit|market))?/i);
        if (tradeMatch) {
          const [, sideRaw, qtyRaw, symbolRaw, priceRaw, typeRaw] = tradeMatch;
          const { broker, accountId, note } = await resolveIntelligenceBroker(ctx.user.id);
          const res = await proposeTicket(ctx.user.id, {
            strategy: "MANUAL",
            broker,
            accountId,
            symbol: symbolRaw.toUpperCase(),
            side: sideRaw.toUpperCase() as "BUY" | "SELL",
            quantity: parseInt(qtyRaw, 10),
            orderType: typeRaw?.toLowerCase() === "market" || !priceRaw ? "MKT" : "LMT",
            limitPrice: priceRaw ? parseFloat(priceRaw) : undefined,
            origin: "INTELLIGENCE",
          });
          const t = res.ticket;
          return {
            kind: "text" as const,
            reply:
              `I've staged that as ticket **${t.ticketId}** — nothing has been sent to any broker.\n\n` +
              `· ${t.symbol} ${t.side} ${t.quantity} @ ${t.orderType}${t.limitPrice ? ` ${t.limitPrice}` : ""}\n` +
              `· Venue: ${t.effectiveBroker}${res.degradedNote ? ` (${res.degradedNote})` : ""}\n` +
              `· Policy: ${note}\n` +
              `· Expires: 5 minutes\n\n` +
              `To authorize it, reply exactly:\n\`CONFIRM ORDER ${t.ticketId}\`\nTo cancel it, reply:\n\`REJECT ORDER ${t.ticketId}\`\n\n` +
              `You'll also find it in the notification center with CONFIRM / REJECT buttons.`,
          };
        }
      }

      // 3) No canned fake portfolio/fills — real answers come from agentChat
      //    tools (live snapshot). If the model is offline, fall through to
      //    strategy parse / honest fallback below.
      const parsed = (await openAiParse(text)) ?? parseStrategyText(text);
      if (parsed) {
        const saved = await createStrategy({
          userId: ctx.user.id,
          name: parsed.title.slice(0, 60),
          prompt: text,
          asset: parsed.asset,
          parsedPlan: JSON.stringify(parsed),
        });
        return {
          kind: "parsed" as const,
          // accounts = the user's REAL connected-account count (§2/§5) — the
          // strategy routes nowhere until connections exist.
          parsed: { title: parsed.title, lines: parsed.lines, accounts: (await findAccountsByUser(ctx.user.id)).length },
          savedStrategyId: saved?.id ?? null,
        };
      }

      // 3) Lucia (OPENAI_PROMPT_ID) first; swarm agentChat as fallback.
      //    With the intent router on, this tail only serves STRATEGIZE requests the
      //    parser couldn't handle — the write tool stays removed.
      const swarmReply = await conversationalReply(effectiveText, {
        allowTradeTool: routerOn ? false : undefined,
        conversationId,
        skipDeterministicLayers: chitchatTurn,
      });
      if (swarmReply) return { kind: "text" as const, reply: swarmReply };

      return {
        kind: "text" as const,
        reply:
          "Understood. If you paste a text strategy with ENTRY / EXIT / SIZING lines, I'll parse it, run risk checks, and save it to your Strategies library. Try inserting one from the Strategy Library on the right.",
      };
  })();

  if (conversationId) {
    const assistantText =
      result.reply ??
      (result.kind === "parsed" ? "Strategy parsed and saved to your Strategies library as Paper." : undefined);
    if (assistantText) {
      await saveMessage(user.id, "assistant", assistantText, conversationId);
      if (contextEnabled) {
        if (marketMeta?.symbols?.length) {
          const session = extractEarningsSessionFilter(effectiveText);
          let kind: DisplayScopeKind = "data_reply";
          if (/finnhub|quarterly earnings|earnings calendar/i.test(assistantText)) {
            kind = session ? "earnings_session_slice" : "earnings_calendar";
          } else if (/Revision 1|Earnings candidate research/i.test(assistantText)) {
            kind = "research";
          }
          commitDisplayScope(workingSet, marketMeta.symbols, kind);
        } else {
          const inferred = inferDisplayScopeFromAssistantReply(text, assistantText, workingSet);
          if (inferred?.length) {
            commitDisplayScope(
              workingSet,
              inferred.map((e) => e.symbol),
              "inferred_reply",
            );
          }
        }
      }
    }
  }
  return marketMeta ? { ...result, market: marketMeta } : result;
  } finally {
    if (contextEnabled && conversationId) {
      await persistConversationSession(user.id, conversationId).catch(() => undefined);
    }
  }
}
