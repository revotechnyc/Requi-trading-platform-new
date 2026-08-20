/**
 * SSE stream for Intelligence chat — new UI keeps Library / Conversations /
 * Scheduled panels; this endpoint powers the Trading Console with progressive
 * replies. Gate order matches `runIntelligenceChat` (shared with tRPC + scheduler).
 */
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import { authenticateRequest } from "./kimi/auth";
import { ensureConversation, runIntelligenceChat } from "./intelligence-router";

type SsePayload = Record<string, unknown>;

function sseData(obj: SsePayload): string {
  return JSON.stringify(obj);
}

/** Progressive token chunks so the new UI can render like the live stream. */
async function emitTextTokens(
  reply: string,
  write: (obj: SsePayload) => Promise<void>,
) {
  const chunkSize = 18;
  for (let i = 0; i < reply.length; i += chunkSize) {
    const content = reply.slice(i, i + chunkSize);
    await write({ type: "token", content });
    // Tiny yield so the browser can paint between chunks
    await new Promise((r) => setTimeout(r, 6));
  }
}

export async function intelligenceStreamHandler(c: Context) {
  let user;
  try {
    user = await authenticateRequest(c.req.raw.headers);
  } catch {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: { text?: string; conversationId?: string | null };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const text = (body.text ?? "").trim();
  if (!text || text.length > 8000) {
    return c.json({ error: "text required (1–8000 chars)" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const write = async (obj: SsePayload) => {
      await stream.writeSSE({ data: sseData(obj) });
    };

    try {
      await write({ type: "phase", phase: "initializing" });

      const conversationId = await ensureConversation(
        user.id,
        body.conversationId ?? undefined,
        text,
      );
      await write({ type: "conversation", conversationId });
      await write({ type: "phase", phase: "processing" });

      const result = await runIntelligenceChat(user, text, conversationId);

      if (result.kind === "parsed" && result.parsed) {
        await write({ type: "phase", phase: "parsing_strategy" });
        await write({
          type: "done",
          kind: "parsed",
          parsed: result.parsed,
          savedStrategyId: result.savedStrategyId ?? null,
          conversationId,
          market: result.market,
        });
        return;
      }

      const reply = String(result.reply ?? "").trim();
      if (!reply) {
        await write({
          type: "error",
          error: "Intelligence returned an empty reply. Please try again.",
        });
        return;
      }

      await write({ type: "phase", phase: "generating" });
      await emitTextTokens(reply, write);
      await write({
        type: "done",
        kind: "text",
        reply,
        conversationId,
        market: result.market,
      });
    } catch (err) {
      console.error("[intelligence-stream] failed", err);
      await write({
        type: "error",
        error: "Intelligence could not complete that request. Please try again.",
      });
    }
  });
}
