/**
 * Lightweight Robinhood Trading MCP health probe (initialize + optional tools/list).
 * Connection verification only — no order placement.
 */
import { RH_MCP_ENDPOINT } from "./oauth";

export type RhMcpHealth = {
  ok: boolean;
  detail: string;
  toolCount: number | null;
};

async function mcpJsonRpc(
  accessToken: string,
  method: string,
  params: Record<string, unknown>,
  id = 1,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(RH_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // SSE / plain text
  }
  return { ok: res.ok, status: res.status, body };
}

export async function probeRhMcp(accessToken: string): Promise<RhMcpHealth> {
  try {
    const init = await mcpJsonRpc(accessToken, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "requi-trading", version: "1.0.0" },
    });
    if (init.status === 401 || init.status === 403) {
      return {
        ok: false,
        detail: `MCP auth failed (HTTP ${init.status}) — reconnect Robinhood Agentic MCP`,
        toolCount: null,
      };
    }
    if (!init.ok) {
      return {
        ok: false,
        detail: `MCP initialize failed (HTTP ${init.status})`,
        toolCount: null,
      };
    }

    let toolCount: number | null = null;
    try {
      const listed = await mcpJsonRpc(accessToken, "tools/list", {}, 2);
      const result = (listed.body as { result?: { tools?: unknown[] } } | null)?.result;
      if (listed.ok && Array.isArray(result?.tools)) {
        toolCount = result.tools.length;
      }
    } catch {
      /* optional */
    }

    return {
      ok: true,
      detail:
        toolCount != null
          ? `Agentic MCP connected · ${toolCount} tool(s) advertised`
          : "Agentic MCP connected (initialize OK)",
      toolCount,
    };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "MCP health probe failed",
      toolCount: null,
    };
  }
}
