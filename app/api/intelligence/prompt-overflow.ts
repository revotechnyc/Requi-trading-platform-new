/**
 * Long-prompt overflow handling (Revision 1).
 *
 * Client rule: LONG PROMPT → AUTO HANDLE → COMPLETE CONTEXT
 * Never silently truncate or reject large research protocols.
 */
import { createHash, randomUUID } from "crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/** App-level accept limit (chars). Far above prior 8k reject. */
export const MAX_USER_PROMPT_CHARS = 500_000;

/**
 * User-message size that is safe to send inline to the model without
 * attachment packaging. Larger prompts become an attachment + pointer.
 */
export const INLINE_SAFE_CHARS = Number(process.env.PROMPT_INLINE_SAFE_CHARS) || 28_000;

/** Soft chunk size when injecting attachment body into model context. */
export const ATTACHMENT_CHUNK_CHARS = 12_000;

export type PromptOverflowResult = {
  /** Original full text — never truncated. */
  originalText: string;
  /** Text if under INLINE_SAFE_CHARS; true if packaged as attachment. */
  overflow: boolean;
  estimatedTokens: number;
  attachmentId: string | null;
  attachmentPath: string | null;
  /**
   * Text that should be sent as the user/chat role content.
   * When overflow, this is a short instruction pointing at the attachment.
   */
  modelUserText: string;
  /** Extra developer/system blocks carrying the full protocol (chunked). */
  attachmentBlocks: string[];
};

const storeRoot = () => join(tmpdir(), "requi-prompt-attachments");

function ensureStore() {
  const root = storeRoot();
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  return root;
}

export function estimateTokens(text: string): number {
  // Rough English heuristic used for routing only — not billing.
  return Math.ceil(text.length / 4);
}

export function acceptPromptLength(text: string): { ok: true } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "text required" };
  if (text.length > MAX_USER_PROMPT_CHARS) {
    return {
      ok: false,
      error: `Prompt exceeds application maximum (${MAX_USER_PROMPT_CHARS.toLocaleString()} characters). Split into multiple research documents or raise MAX_USER_PROMPT_CHARS.`,
    };
  }
  return { ok: true };
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Persist full prompt to disk; return id + path. */
export function storePromptAttachment(text: string): { id: string; path: string } {
  const root = ensureStore();
  const hash = createHash("sha256").update(text).digest("hex").slice(0, 16);
  const id = `prompt_${hash}_${randomUUID().slice(0, 8)}`;
  const path = join(root, `${id}.txt`);
  writeFileSync(path, text, "utf8");
  return { id, path };
}

export function readPromptAttachment(id: string): string | null {
  const path = join(storeRoot(), `${id}.txt`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/**
 * Prepare a user prompt for model submission.
 * Small prompts pass through. Large prompts are stored and chunk-injected —
 * never truncated.
 */
export function preparePromptForModel(text: string): PromptOverflowResult {
  const originalText = text;
  const estimatedTokens = estimateTokens(text);

  if (text.length <= INLINE_SAFE_CHARS) {
    return {
      originalText,
      overflow: false,
      estimatedTokens,
      attachmentId: null,
      attachmentPath: null,
      modelUserText: text,
      attachmentBlocks: [],
    };
  }

  const { id, path } = storePromptAttachment(text);
  const chunks = chunkText(text, ATTACHMENT_CHUNK_CHARS);
  const attachmentBlocks = chunks.map((chunk, i) => {
    const header =
      i === 0
        ? `=== RESEARCH PROTOCOL ATTACHMENT (COMPLETE — DO NOT TRUNCATE) ===\n` +
          `attachment_id=${id}\n` +
          `chars=${text.length}\n` +
          `estimated_tokens≈${estimatedTokens}\n` +
          `part ${i + 1}/${chunks.length}\n` +
          `Treat every section below as governing research instructions.\n\n`
        : `=== RESEARCH PROTOCOL ATTACHMENT part ${i + 1}/${chunks.length} (continuation) ===\n\n`;
    return header + chunk;
  });

  const modelUserText =
    `Execute the complete research protocol in the attached document (attachment_id=${id}, ${text.length.toLocaleString()} characters, ${chunks.length} parts).\n` +
    `The full original prompt is provided in the developer/system attachment blocks — use ALL of it.\n` +
    `Do not ask me to shorten it. Do not omit sections. Preserve scoring, WAIT/BLOCKED, and report requirements.\n` +
    `If required data is unavailable, label fields unavailable / WAIT / BLOCKED and name the owning API — never invent numbers.`;

  return {
    originalText,
    overflow: true,
    estimatedTokens,
    attachmentId: id,
    attachmentPath: path,
    modelUserText,
    attachmentBlocks,
  };
}
