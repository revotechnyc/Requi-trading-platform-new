import type { BrokerAdapter, BrokerAccount, BrokerCapabilities, BrokerOrderAck, BrokerPosition, OrderIntent } from "./types";

/**
 * Robinhood Trading MCP adapter.
 *
 * Connection model (per Robinhood's Agentic Trading documentation):
 * - Transport: streamable HTTP MCP at https://agent.robinhood.com/mcp/trading
 * - Auth: OAuth 2.0 bearer token obtained through Robinhood's agentic linking
 *   flow (user links the account in their AI platform of choice, token is
 *   supplied to Requi via the ROBINHOOD_MCP_TOKEN env var).
 * - Read tools: accounts, positions, balances, order history, watchlists,
 *   scans, equity quotes.
 * - Write tools: place_equity_order (and single-leg option orders) — trades
 *   execute ONLY in the user's dedicated "Robinhood Agentic" account.
 *
 * Protocol: JSON-RPC 2.0 over HTTP POST (initialize → tools/list → tools/call).
 * Robinhood does not publish response schemas; this adapter defensively
 * normalizes whatever the tools return and reports UNKNOWN order states to
 * the caller (the ticket service treats UNKNOWN as unresolvable — never
 * blindly resubmitted).
 */

const MCP_URL = process.env.ROBINHOOD_MCP_URL ?? "https://agent.robinhood.com/mcp/trading";

interface JsonRpcResult<T = unknown> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export class RobinhoodMcpBroker implements BrokerAdapter {
  readonly code = "ROBINHOOD_MCP" as const;
  readonly displayName = "Robinhood (Agentic Trading MCP)";
  private rpcSeq = 0;
  private sessionId: string | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  capabilities(): BrokerCapabilities {
    return {
      assetClasses: ["Stocks", "Options (single-leg)"],
      orderTypes: ["MKT", "LMT"],
      streaming: false,
      extendedHours: false,
      multiLegOptions: false,
      bracketOco: false,
      paperTrading: false,
      notes: "Executes only in the user's Robinhood Agentic account. Tools: place_equity_order, single-leg options, portfolio/quotes/watchlists/scans.",
    };
  }

  private async rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = ++this.rpcSeq;
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${this.token}`,
        ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!res.ok) throw new Error(`Robinhood MCP HTTP ${res.status}`);
    const body = (await res.json()) as JsonRpcResult<T>;
    if (body.error) throw new Error(`Robinhood MCP ${body.error.code}: ${body.error.message}`);
    return body.result as T;
  }

  private async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const out = await this.rpc<{ content?: Array<{ type: string; text?: string }>; structuredContent?: T }>("tools/call", { name, arguments: args });
    if (out?.structuredContent) return out.structuredContent;
    const text = out?.content?.find((c) => c.type === "text")?.text;
    try {
      return JSON.parse(text ?? "{}") as T;
    } catch {
      return { raw: text } as T;
    }
  }

  async healthCheck() {
    try {
      await this.rpc("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "requi-trading", version: "2.1.0" },
      });
      const tools = await this.rpc<{ tools?: Array<{ name: string }> }>("tools/list");
      return { ok: true, detail: `connected · ${tools.tools?.length ?? 0} tools available` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const data = await this.callTool<{ accounts?: Array<Record<string, unknown>> }>("get_accounts", {});
    const accounts = data.accounts ?? [];
    return accounts.map((a, i) => ({
      accountId: String(a.account_number ?? a.accountNumber ?? `RH-${i}`),
      label: String(a.type ?? "Robinhood Agentic"),
      equity: Number(a.equity ?? 0),
      cash: Number(a.cash ?? a.buying_power ?? 0),
      buyingPower: Number(a.buying_power ?? 0),
    }));
  }

  async getPositions(_accountId: string): Promise<BrokerPosition[]> {
    const data = await this.callTool<{ positions?: Array<Record<string, unknown>> }>("get_equity_positions", {});
    return (data.positions ?? []).map((p) => ({
      symbol: String(p.symbol ?? p.instrument_symbol ?? ""),
      quantity: Number(p.quantity ?? 0),
      averageCost: Number(p.average_buy_price ?? p.average_cost ?? 0),
      marketValue: Number(p.market_value ?? 0),
      unrealizedPnl: Number(p.unrealized_pnl ?? 0),
    }));
  }

  async placeOrder(_accountId: string, intent: OrderIntent): Promise<BrokerOrderAck> {
    // Robinhood MCP exposes equity (and single-leg option) order tools.
    const data = await this.callTool<Record<string, unknown>>("place_equity_order", {
      symbol: intent.symbol,
      side: intent.side.toLowerCase(),
      type: intent.orderType === "MKT" ? "market" : "limit",
      quantity: intent.quantity,
      ...(intent.limitPrice ? { limit_price: intent.limitPrice } : {}),
      time_in_force: intent.tif.toLowerCase(),
      client_order_id: intent.clientOrderId, // idempotency
    });
    const id = String(data.id ?? data.order_id ?? "");
    if (!id) {
      // No order id and no published schema — unresolvable. UNKNOWN is a dead
      // end: the ticket service will NOT resubmit.
      return { brokerOrderId: "", status: "UNKNOWN", message: "no order id in MCP response" };
    }
    const state = String(data.state ?? data.status ?? "submitted").toLowerCase();
    return {
      brokerOrderId: id,
      status: state.includes("fill") ? "FILLED" : state.includes("reject") ? "REJECTED" : "ACKNOWLEDGED",
      filledQuantity: Number(data.filled_quantity ?? 0) || undefined,
      averagePrice: Number(data.average_price ?? 0) || undefined,
      message: state,
    };
  }

  async cancelOrder(_accountId: string, brokerOrderId: string) {
    try {
      await this.callTool("cancel_order", { order_id: brokerOrderId });
      return { ok: true, message: "cancel requested" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async getOrderStatus(_accountId: string, brokerOrderId: string): Promise<BrokerOrderAck> {
    const data = await this.callTool<Record<string, unknown>>("get_order", { order_id: brokerOrderId });
    const state = String(data.state ?? data.status ?? "").toLowerCase();
    if (!state) return { brokerOrderId, status: "UNKNOWN" };
    return {
      brokerOrderId,
      status: state.includes("fill") ? "FILLED" : state.includes("reject") || state.includes("cancel") ? "REJECTED" : "WORKING",
      filledQuantity: Number(data.filled_quantity ?? 0) || undefined,
      averagePrice: Number(data.average_price ?? 0) || undefined,
      message: state,
    };
  }
}
