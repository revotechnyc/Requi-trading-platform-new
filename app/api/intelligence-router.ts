import { z } from "zod";
import { createRouter, authedQuery } from "./middleware";
import { createStrategy, findAccountsByUser } from "./queries/trading";
import { confirmTicket, proposeTicket, rejectTicket } from "./queries/tickets";
import { agentChat, type AgentChatOptions, type MarketMeta } from "./intelligence/tools";
import { luciaPromptChat } from "./intelligence/lucia-prompt";
import { clearHistory, loadHistory, saveMessage } from "./intelligence/memory";
import { and, eq, isNull } from "drizzle-orm";
import { conversations } from "@db/schema";
import { getDb } from "./queries/connection";
import {
  advisoryFresh,
  classifyIntent,
  clearThreadState,
  composeAdvisory,
  getThreadState,
  setThreadState,
} from "./intelligence/intent";

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
    body.reasoning_effort = "none";
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
    .input(z.object({ text: z.string().min(1).max(8000), conversationId: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
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
  const [row] = await db.insert(conversations).values({ userId, title }).returning();
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

  // Persist every turn to the conversation (deterministic paths bypass
  // agentChat, which no longer saves — persistence is centralized here so
  // Recent Conversations always has the full thread).
  if (conversationId) await saveMessage(user.id, "user", text, conversationId);

  // Gateway market meta (source/staleness) rides back to the UI chip whenever
  // a model turn resolved symbols through the Market Data Gateway.
  let marketMeta: MarketMeta | null = null;
  const withMarket = (o: AgentChatOptions): AgentChatOptions => ({
    ...o,
    onMarketMeta: (m) => {
      marketMeta = m;
    },
  });

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
    const lucia = await luciaPromptChat(ctx.user.id, userText, {
      conversationId: options.conversationId ?? conversationId,
      developerExtra: options.developerExtra,
    });
    if (lucia?.reply) return lucia.reply;
    return agentChat(ctx.user.id, userText, withMarket(options));
  }

  const result = await (async (): Promise<{ kind: string; reply?: string; [k: string]: unknown }> => {


      // 0) anti-exposure guard — architectural confidentiality, checked first
      if (isExposureAttempt(text)) {
        return { kind: "text" as const, reply: EXPOSURE_REFUSAL };
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
        const thread = getThreadState(ctx.user.id);
        const intent = classifyIntent(text, thread);

        if (intent.mode === "TRADE_INTENT") {
          // 2a) imperative follow-up on a FRESH advisory → the one turn where the
          //     write tool exists. The engine's advisory rides along verbatim.
          if (intent.followUp && advisoryFresh(thread.advisory)) {
            const staged = await conversationalReply(text, {
              allowTradeTool: true,
              advisory: thread.advisory,
              conversationId,
            });
            // fail-safe toward CONVERSING: the advisory is consumed by this turn
            clearThreadState(ctx.user.id);
            if (staged) return { kind: "text" as const, reply: staged };
            return {
              kind: "text" as const,
              reply:
                "I couldn't reach the reasoning model just now. The advisory stands — say \"stage it\" again in a moment, or place the trade from the Tickets panel.",
            };
          }

          // 2b) fresh imperative ("buy apple") → deterministic advisory FIRST.
          //     No ticket is created on this turn; the write tool is absent.
          if (!intent.symbol) {
            return {
              kind: "text" as const,
              reply:
                "Which symbol? Tell me the ticker (e.g. \"buy AAPL\") and I'll run it through market analysis and our protocol before anything is staged.",
            };
          }
          try {
            const advisory = await composeAdvisory(ctx.user.id, intent.symbol, intent.side ?? "BUY");
            setThreadState(ctx.user.id, { advisory });
            const narrated = await conversationalReply(text, {
              allowTradeTool: false,
              advisory,
              conversationId,
              developerExtra: `=== ADVISORY (deterministic engine verdict — narrate it faithfully, never invent or alter its numbers) ===\n${JSON.stringify(advisory)}`,
            });
            if (narrated) return { kind: "text" as const, reply: narrated };
            // Deterministic fallback narration if the model is unavailable —
            // the verdict still comes from the engine, never invented.
            const a = advisory;
            return {
              kind: "text" as const,
              reply:
                `**${a.symbol} ${a.side} — verdict: ${a.verdict}**\n\n` +
                a.reasons.map((r) => `· ${r}`).join("\n") +
                (a.watchFor ? `\n\nWatch for: ${a.watchFor}` : "") +
                (a.verdict === "FAVORABLE"
                  ? "\n\nIf you want to proceed, say \"stage it\" and I'll prepare a ticket — nothing trades without your CONFIRM."
                  : ""),
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
          // CHAT / STATUS_QUERY → stored prompt (Lucia) first, then swarm tools.
          const reply = await conversationalReply(text, {
            allowTradeTool: false,
            conversationId,
          });
          if (reply) return { kind: "text" as const, reply };
        }
      } else {
        // LEGACY path (INTENT_ROUTER=off): natural-language trade proposal → staged ticket
        const tradeMatch = text.match(/^(buy|sell)\s+(\d+)\s+([A-Za-z.]{1,12})(?:\s+(?:at|@)\s+(\d+(?:\.\d+)?))?(?:\s+(limit|market))?/i);
        if (tradeMatch) {
          const [, sideRaw, qtyRaw, symbolRaw, priceRaw, typeRaw] = tradeMatch;
          const res = await proposeTicket(ctx.user.id, {
            strategy: "MANUAL",
            broker: "PAPER",
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
      const swarmReply = await conversationalReply(text, {
        allowTradeTool: routerOn ? false : undefined,
        conversationId,
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
    if (assistantText) await saveMessage(user.id, "assistant", assistantText, conversationId);
  }
  return marketMeta ? { ...result, market: marketMeta } : result;
}
