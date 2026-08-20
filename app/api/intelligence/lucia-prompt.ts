/**
 * Lucia / Requi Trading stored prompt via OpenAI Responses API.
 * Same path as the live trading app: OPENAI_PROMPT_ID (+ optional version,
 * vector store file_search, web_search). Falls back to null so callers can
 * use the swarm agentChat loop when the prompt is unset or Responses fails.
 */
import { loadHistory } from "./memory";
import { learningSummaryLines } from "../engine/learning";

export type ChatWebSource = { title: string; url: string };

export type ChatMeta = {
  fileSearch: boolean;
  webSearch: boolean;
  filenames: string[];
  urls: ChatWebSource[];
};

export type LuciaChatResult = { reply: string; meta: ChatMeta };

const EMPTY_META: ChatMeta = {
  fileSearch: false,
  webSearch: false,
  filenames: [],
  urls: [],
};

/** Thin platform overlay — does not replace Lucia identity. */
export const PLATFORM_RUNTIME_NOTES = `Platform runtime notes (keep your Lucia identity; these are product facts):
- TRADE PROTOCOL / INTENT ROUTER: When INTENT_ROUTER is on (default), imperative buys ("buy AAPL") get a deterministic advisory first — no ticket until the user says "stage it". Questions ("should I buy…?") stay conversation. Exact CONFIRM ORDER / REJECT ORDER always hit the confirmation gate. Set INTENT_ROUTER=off to restore legacy immediate protocol staging.
- CALCULATIONS ARE DETERMINISTIC. Prices, indicators, positions, and P&L come from Requi's Market Data Gateway + portfolio ledger — never invent or estimate numbers. Your job is reasoning and explanation only.
- When VERIFIED MARKET DATA is attached, treat it as authoritative (cite source + timestamp; disclose staleness). If data is unavailable, say UNVERIFIED / NO TRADE — never fabricate a quote.
- You do not place, fill, modify, or cancel broker orders yourself. Users authorize staged tickets only with exact CONFIRM ORDER [TICKET_ID] / REJECT ORDER [TICKET_ID].
- Do not invent live portfolio balances, fills, stops, or broker acknowledgements.
- When useful, format with light markdown: **bold**, ## headings, - bullets, numbered lists.
- MEMORY & LEARNING: earlier messages in this conversation are real history — use them for continuity. When a LEARNING section is present, apply those lessons proactively.`;

function extractResponsesText(data: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of data.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }
  return parts.join("").trim();
}

function extractChatMeta(data: {
  output?: Array<{
    type?: string;
    results?: Array<{ filename?: string; attributes?: { filename?: string } }>;
    content?: Array<{
      type?: string;
      annotations?: Array<{
        type?: string;
        filename?: string;
        title?: string;
        url?: string;
      }>;
    }>;
  }>;
}): ChatMeta {
  let fileSearch = false;
  let webSearch = false;
  const filenames = new Set<string>();
  const urlMap = new Map<string, ChatWebSource>();

  for (const item of data.output ?? []) {
    if (item.type === "file_search_call") {
      fileSearch = true;
      for (const r of item.results ?? []) {
        const name = r.filename || r.attributes?.filename;
        if (name) filenames.add(name);
      }
    }
    if (item.type === "web_search_call" || item.type === "web_search") {
      webSearch = true;
    }
    if (item.type === "message") {
      for (const part of item.content ?? []) {
        for (const ann of part.annotations ?? []) {
          if (
            (ann.type === "file_citation" || ann.type === "filename_citation") &&
            ann.filename
          ) {
            fileSearch = true;
            filenames.add(ann.filename);
          }
          if ((ann.type === "url_citation" || ann.type === "web_citation") && ann.url) {
            webSearch = true;
            if (!urlMap.has(ann.url)) {
              urlMap.set(ann.url, {
                title: ann.title || ann.url,
                url: ann.url,
              });
            }
          }
        }
      }
    }
  }

  return {
    fileSearch,
    webSearch,
    filenames: [...filenames].slice(0, 12),
    urls: [...urlMap.values()].slice(0, 12),
  };
}

function openaiUserFacingError(status: number, body: string): string {
  if (status === 429 || /insufficient_quota/i.test(body)) {
    return "Lucia can't reach OpenAI right now — **API quota is exhausted**. Top up billing at platform.openai.com, then try again.";
  }
  if (status === 401 || status === 403) {
    return "Lucia can't authenticate with OpenAI — check `OPENAI_API_KEY` on the server.";
  }
  return "Lucia hit a temporary OpenAI error. Please try again in a moment.";
}

export function promptIdConfigured(): boolean {
  return Boolean(process.env.OPENAI_PROMPT_ID?.trim() && process.env.OPENAI_API_KEY?.trim());
}

export type LuciaChatOptions = {
  conversationId?: string;
  /** Extra developer overlay (e.g. advisory JSON). */
  developerExtra?: string;
  /** Inject market gateway lines for tickers in the user text. */
  injectMarket?: boolean;
};

/**
 * Call stored OpenAI prompt (Responses API). Returns null when prompt id is
 * unset so callers can fall back to agentChat / swarm tools.
 */
export async function luciaPromptChat(
  userId: string,
  text: string,
  opts?: LuciaChatOptions,
): Promise<LuciaChatResult | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  const promptId = process.env.OPENAI_PROMPT_ID?.trim();
  if (!key || !promptId) return null;

  const promptVersion = process.env.OPENAI_PROMPT_VERSION?.trim() || undefined;
  const history = await loadHistory(userId, undefined, opts?.conversationId);
  const learningLines = await learningSummaryLines(userId).catch(() => [] as string[]);
  const learningBlock =
    learningLines.length > 0
      ? `LEARNING (hard-won facts about OUR system — apply proactively):\n${learningLines.map((l) => `- ${l}`).join("\n")}`
      : "";

  let marketBlock = "";
  if (opts?.injectMarket !== false) {
    try {
      const stop = new Set([
        "A", "I", "AND", "THE", "FOR", "BUY", "SELL", "STOP", "USD", "LIVE", "PAPER", "ORDER", "CONFIRM", "HI", "HELLO",
      ]);
      const syms = [
        ...new Set(
          (text.toUpperCase().match(/\b[A-Z]{1,5}\b/g) ?? [])
            .filter((s) => !stop.has(s))
            .slice(0, 4),
        ),
      ];
      if (syms.length > 0) {
        const { getSnapshot, getIndicators } = await import("../marketdata/gateway/gateway");
        const lines: string[] = [];
        for (const sym of syms) {
          const snap = await getSnapshot(userId, sym);
          if (!snap.market_data_available) {
            lines.push(`${sym}: UNAVAILABLE`);
            continue;
          }
          const ind = await getIndicators(userId, sym).catch(() => null);
          const rsi =
            ind?.available && ind.indicators
              ? String((ind.indicators as { rsi_14?: number | null }).rsi_14 ?? "n/a")
              : "n/a";
          lines.push(
            `${sym}: price=${snap.price} src=${snap.source_name} ts=${snap.timestamp} stale=${snap.stale} rsi14=${rsi}`,
          );
        }
        if (lines.length) {
          marketBlock = `=== VERIFIED MARKET DATA (RTI Market Data Gateway — AUTHORITATIVE) ===\n${lines.join("\n")}\nUse these values exactly; never estimate prices.`;
        }
      }
    } catch (e) {
      console.error("[intelligence] lucia market inject failed", e);
    }
  }

  try {
    const vectorStoreId = process.env.OPENAI_VECTOR_STORE_ID?.trim();
    const enableWebSearch = process.env.OPENAI_WEB_SEARCH !== "0";
    const body: Record<string, unknown> = {
      prompt: {
        id: promptId,
        ...(promptVersion ? { version: promptVersion } : {}),
      },
      input: [
        { role: "developer", content: PLATFORM_RUNTIME_NOTES },
        ...(opts?.developerExtra
          ? [{ role: "developer" as const, content: opts.developerExtra }]
          : []),
        ...(marketBlock ? [{ role: "developer" as const, content: marketBlock }] : []),
        ...(learningBlock ? [{ role: "developer" as const, content: learningBlock }] : []),
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: text },
      ],
      store: false,
    };

    const tools: Array<Record<string, unknown>> = [];
    if (vectorStoreId) {
      tools.push({
        type: "file_search",
        vector_store_ids: [vectorStoreId],
      });
    }
    if (enableWebSearch) {
      tools.push({ type: "web_search" });
    }
    if (tools.length) {
      body.tools = tools;
      body.include = ["file_search_call.results"];
    }

    const responsesModel = process.env.OPENAI_RESPONSES_MODEL?.trim();
    if (responsesModel) body.model = responsesModel;

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[intelligence] luciaPromptChat Responses HTTP", res.status, errBody.slice(0, 500));
      return {
        reply: openaiUserFacingError(res.status, errBody),
        meta: EMPTY_META,
      };
    }

    const data = (await res.json()) as Parameters<typeof extractResponsesText>[0] &
      Parameters<typeof extractChatMeta>[0];
    const reply = extractResponsesText(data);
    if (!reply) {
      console.error("[intelligence] luciaPromptChat: empty output");
      return null;
    }
    return { reply, meta: extractChatMeta(data) };
  } catch (err) {
    console.error("[intelligence] luciaPromptChat failed", err);
    return null;
  }
}
