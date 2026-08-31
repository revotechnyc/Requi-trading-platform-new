/**
 * Lucia / Requi Trading stored prompt via OpenAI Responses API.
 * Same path as the live trading app: OPENAI_PROMPT_ID (+ optional version,
 * vector store file_search, web_search). Falls back to null so callers can
 * use the swarm agentChat loop when the prompt is unset or Responses fails.
 */
import { loadHistory } from "./memory";
import { learningSummaryLines } from "../engine/learning";
import { buildMarketContextBlock, type MarketMeta } from "./tools";

export type ChatWebSource = { title: string; url: string };

export type ChatMeta = {
  fileSearch: boolean;
  webSearch: boolean;
  filenames: string[];
  urls: ChatWebSource[];
};

export type LuciaChatResult = { reply: string; meta: ChatMeta; marketMeta?: MarketMeta | null };

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
  if (/reasoning\.summary/i.test(body) && /verify.*organization/i.test(body)) {
    return "Lucia is temporarily using the fallback engine — OpenAI prompt v29 needs a **verified organization** for reasoning summaries. Verify at platform.openai.com → Settings → Organization, or keep `OPENAI_PROMPT_VERSION=28` until then.";
  }
  return "Lucia hit a temporary OpenAI error. Please try again in a moment.";
}

/** Stored prompts carry their own model; overriding with o4-mini re-triggers summary=detailed on v29+. */
function shouldAttachResponsesModel(): boolean {
  return process.env.OPENAI_RESPONSES_MODEL_OVERRIDE === "1";
}

/** v29+ may pin summary=detailed (needs verified OpenAI org). Fallback version works today. */
function promptVersionsToTry(): string[] {
  const primary = process.env.OPENAI_PROMPT_VERSION?.trim();
  const fallback = process.env.OPENAI_PROMPT_FALLBACK_VERSION?.trim() || "28";
  const versions: string[] = [];
  if (primary) versions.push(primary);
  if (!versions.includes(fallback)) versions.push(fallback);
  return versions;
}

function isReasoningSummaryOrgError(status: number, body: string): boolean {
  return status === 400 && /reasoning\.summary/i.test(body) && /verify.*organization/i.test(body);
}

async function callResponsesApi(
  key: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number; body: string }> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true, data: await res.json() };
  return { ok: false, status: res.status, body: await res.text().catch(() => "") };
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
  let marketMeta: MarketMeta | null = null;
  if (opts?.injectMarket !== false) {
    try {
      const market = await buildMarketContextBlock(userId, text);
      marketBlock = market.block.trim();
      marketMeta = market.meta;
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
    if (responsesModel && shouldAttachResponsesModel()) body.model = responsesModel;

    let data: Parameters<typeof extractResponsesText>[0] &
      Parameters<typeof extractChatMeta>[0] | null = null;
    let lastErr = "";

    for (const version of promptVersionsToTry()) {
      const attemptBody = {
        ...body,
        prompt: { id: promptId, version },
      };
      const result = await callResponsesApi(key, attemptBody);
      if (result.ok) {
        data = result.data as typeof data;
        if (version !== promptVersion) {
          console.warn(`[intelligence] luciaPromptChat: prompt v${version} used (v${promptVersion ?? "?"} unavailable — org verification or model override)`);
        }
        break;
      }
      lastErr = result.body;
      if (!isReasoningSummaryOrgError(result.status, result.body)) {
        console.error("[intelligence] luciaPromptChat Responses HTTP", result.status, result.body.slice(0, 500));
        return {
          reply: openaiUserFacingError(result.status, result.body),
          meta: EMPTY_META,
          marketMeta,
        };
      }
      console.warn(`[intelligence] luciaPromptChat: prompt v${version} blocked (reasoning summary / org) — trying fallback`);
    }

    if (!data) {
      console.error("[intelligence] luciaPromptChat Responses HTTP 400", lastErr.slice(0, 500));
      // Let intelligence-router fall back to agentChat instead of a dead-end error bubble.
      return null;
    }

    const reply = extractResponsesText(data);
    if (!reply) {
      console.error("[intelligence] luciaPromptChat: empty output");
      return null;
    }
    return { reply, meta: extractChatMeta(data), marketMeta };
  } catch (err) {
    console.error("[intelligence] luciaPromptChat failed", err);
    return null;
  }
}
