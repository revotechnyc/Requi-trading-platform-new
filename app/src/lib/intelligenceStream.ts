/**
 * Client helper — Intelligence SSE stream (Health-parity phases + reasoning).
 */

export type StreamMeta = {
  fileSearch?: boolean;
  webSearch?: boolean;
  filenames?: string[];
  urls?: { title: string; url: string }[];
};

export type StreamDone =
  | {
      kind: 'text';
      reply: string;
      meta?: StreamMeta;
      conversationId?: string;
      market?: { sourceName: string | null; timestamp: string | null; stale: boolean };
    }
  | {
      kind: 'parsed';
      parsed: { title: string; lines: { label: string; body: string }[]; accounts?: number };
      savedStrategyId?: number | null;
      conversationId?: string;
      market?: { sourceName: string | null; timestamp: string | null; stale: boolean };
    };

export type IntelligenceStreamCallbacks = {
  onPhase?: (phase: string, data?: Record<string, unknown>) => void;
  onReasoning?: (chunk: string) => void;
  onReasoningDone?: () => void;
  onToken?: (chunk: string, full: string) => void;
  onMeta?: (meta: StreamMeta) => void;
  onConversation?: (conversationId: string) => void;
  onDone: (result: StreamDone) => void;
  onError: (message: string) => void;
  onAborted?: () => void;
};

const STREAM_TIMEOUT_MS = 360_000;

export function streamIntelligenceChat(
  text: string,
  callbacks: IntelligenceStreamCallbacks,
  options?: { conversationId?: string | null },
): AbortController {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort('timeout'), STREAM_TIMEOUT_MS);

  void (async () => {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      try {
        const { getAccessToken } = await import('@/lib/supabase');
        const token = await getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } catch {
        /* cookie session may still work */
      }

      const res = await fetch('/api/intelligence/stream', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          text,
          conversationId: options?.conversationId || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const msg =
          res.status === 401
            ? 'Please sign in again to use Intelligence.'
            : `Stream failed (${res.status}).`;
        callbacks.onError(msg);
        return;
      }
      if (!res.body) {
        callbacks.onError('No response body from Intelligence stream.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let finished = false;

      const finish = (fn: () => void) => {
        if (finished) return;
        finished = true;
        fn();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            continue;
          }

          const type = data.type as string | undefined;
          if (type === 'conversation' && typeof data.conversationId === 'string') {
            callbacks.onConversation?.(data.conversationId);
          } else if (type === 'phase') {
            callbacks.onPhase?.(String(data.phase ?? ''), data);
          } else if (type === 'reasoning') {
            callbacks.onReasoning?.(String(data.content ?? ''));
          } else if (type === 'reasoning_start') {
            callbacks.onPhase?.('reasoning', data);
          } else if (type === 'reasoning_done') {
            callbacks.onReasoningDone?.();
          } else if (type === 'token') {
            full += String(data.content ?? '');
            callbacks.onToken?.(String(data.content ?? ''), full);
          } else if (type === 'meta') {
            callbacks.onMeta?.({
              fileSearch: Boolean(data.fileSearch),
              webSearch: Boolean(data.webSearch),
              filenames: Array.isArray(data.filenames) ? (data.filenames as string[]) : [],
              urls: Array.isArray(data.urls)
                ? (data.urls as { title: string; url: string }[])
                : [],
            });
          } else if (type === 'done') {
            const convId =
              typeof data.conversationId === 'string' ? data.conversationId : undefined;
            if (data.kind === 'parsed') {
              finish(() =>
                callbacks.onDone({
                  kind: 'parsed',
                  parsed: data.parsed as {
                    title: string;
                    lines: { label: string; body: string }[];
                    accounts?: number;
                  },
                  savedStrategyId: (data.savedStrategyId as number | null) ?? null,
                  conversationId: convId,
                  market: data.market as StreamDone['market'],
                }),
              );
            } else {
              finish(() =>
                callbacks.onDone({
                  kind: 'text',
                  reply: String(data.reply ?? full),
                  meta: data.meta as StreamMeta | undefined,
                  conversationId: convId,
                  market: data.market as StreamDone['market'],
                }),
              );
            }
          } else if (type === 'error') {
            finish(() => callbacks.onError(String(data.error ?? 'Stream error')));
          }
        }
      }

      if (!finished) {
        if (full.trim()) {
          finish(() => callbacks.onDone({ kind: 'text', reply: full.trim() }));
        } else {
          finish(() =>
            callbacks.onError('Stream ended before Lucia finished — please try again.'),
          );
        }
      }
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'AbortError') {
        const reason = (controller.signal as AbortSignal & { reason?: unknown }).reason;
        if (reason === 'timeout') {
          callbacks.onError('Request timed out — try a shorter question, or try again.');
        } else {
          callbacks.onAborted?.();
        }
      } else {
        callbacks.onError('Connection hiccup — I could not reach the engine.');
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  })();

  return controller;
}
