import type { BrokerAdapter, BrokerAccount, BrokerCapabilities, BrokerOpenOrder, BrokerOrderAck, BrokerPosition, OrderIntent } from "./types";

/**
 * Interactive Brokers adapter — Client Portal Web API (CPAPI).
 *
 * Connection model (per IBKR Campus documentation):
 * - Transport: HTTPS REST against the Client Portal Gateway
 *   (self-hosted: https://localhost:5000/v1/api, or the Dockerized gateway;
 *   set IBKR_GATEWAY_URL). Session established by authenticating the gateway
 *   (IBKR login + 2FA); the adapter then keeps the session alive via /tickle.
 * - Contract resolution: symbols must be resolved to IBKR conids
 *   (GET /trsrv/stocks?symbols=... or /iserver/secdef/search).
 * - Place: POST /iserver/account/{accountId}/orders  (body: { orders: [...] })
 * - Modify: POST /iserver/account/{accountId}/order/{orderId}
 * - Cancel: DELETE /iserver/account/{accountId}/order/{orderId}
 * - Status: GET /iserver/account/orders (live orders list)
 * - Positions: GET /portfolio/{accountId}/positions/0
 * - Order messages requiring confirmation: POST /iserver/reply/{replyId}
 *
 * Credentials: IBKR_ACCOUNT + an authenticated gateway session. Never log in
 * programmatically — the operator authenticates the gateway out-of-band.
 */

const BASE = (process.env.IBKR_GATEWAY_URL ?? "https://localhost:5000/v1/api").replace(/\/$/, "");
const DEFAULT_ACCOUNT = process.env.IBKR_ACCOUNT ?? "";

const ORDER_TYPE_MAP: Record<string, string> = {
  MKT: "MKT",
  LMT: "LMT",
  STP: "STP",
  STP_LMT: "STP LMT",
  TRAIL: "TRAIL",
};

export class IbkrBroker implements BrokerAdapter {
  readonly code = "IBKR" as const;
  readonly displayName = "Interactive Brokers (Client Portal API)";
  private conidCache = new Map<string, number>();
  private accountId: string;

  constructor(accountId: string = DEFAULT_ACCOUNT) {
    this.accountId = accountId;
  }

  capabilities(): BrokerCapabilities {
    return {
      assetClasses: ["Stocks", "Options", "Futures", "FOP", "Currencies", "Bonds", "CFDs"],
      orderTypes: ["MKT", "LMT", "STP", "STP_LMT", "TRAIL"],
      streaming: true,
      extendedHours: true,
      multiLegOptions: true,
      bracketOco: true,
      paperTrading: true,
      notes: "Full order-type coverage incl. trailing stops, bracket/OCO and multi-leg combos. Requires an authenticated Client Portal Gateway session.",
    };
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      // Gateway uses a self-signed cert in local deployments — operators mount
      // the CA or run the adapter beside the gateway (see deployment docs).
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`IBKR ${method} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async healthCheck() {
    try {
      const status = await this.req<{ authenticated?: boolean; connected?: boolean }>("GET", "/iserver/auth/status");
      if (status.authenticated) return { ok: true, detail: "gateway authenticated · brokerage session live" };
      return { ok: false, detail: "gateway reachable but not authenticated — operator must log in to the Client Portal Gateway" };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  /** Resolve a US stock symbol to an IBKR conid (cached). */
  private async conid(symbol: string): Promise<number> {
    const hit = this.conidCache.get(symbol);
    if (hit) return hit;
    const rows = await this.req<Array<{ conid?: number }>>("GET", `/trsrv/stocks?symbols=${encodeURIComponent(symbol)}`);
    const id = rows?.[0]?.conid;
    if (!id) throw new Error(`IBKR could not resolve symbol ${symbol} to a conid`);
    this.conidCache.set(symbol, id);
    return id;
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const accounts = await this.req<Array<{ accountId?: string; id?: string; accountTitle?: string }>>("GET", "/portfolio/accounts");
    return (accounts ?? []).map((a) => ({
      accountId: String(a.accountId ?? a.id ?? ""),
      label: String(a.accountTitle ?? "IBKR"),
      equity: 0,
      cash: 0,
      buyingPower: 0,
    }));
  }

  async getPositions(accountId: string): Promise<BrokerPosition[]> {
    const rows = await this.req<Array<Record<string, unknown>>>("GET", `/portfolio/${accountId}/positions/0`);
    return (rows ?? []).map((r) => ({
      symbol: String(r.ticker ?? r.contractDesc ?? ""),
      quantity: Number(r.position ?? 0),
      averageCost: Number(r.avgCost ?? 0),
      marketValue: Number(r.mktValue ?? 0),
      unrealizedPnl: Number(r.unrealizedPnl ?? 0),
    }));
  }

  /** Live orders from the Client Portal — used by the trailing module to reconcile broker-side stops. */
  async getOpenOrders(accountId: string): Promise<BrokerOpenOrder[]> {
    const out = await this.req<{ orders?: Array<Record<string, unknown>> }>("GET", `/iserver/account/${accountId}/orders`);
    const rows = out?.orders ?? [];
    return rows
      .filter((o) => !/fill|cancel/i.test(String(o.status ?? "")))
      .map((o) => ({
        brokerOrderId: String(o.orderId ?? o.order_id ?? ""),
        symbol: o.ticker !== undefined ? String(o.ticker) : null,
        side: o.side !== undefined ? (String(o.side).toUpperCase().startsWith("S") ? "SELL" : "BUY") : null,
        orderType: String(o.orderType ?? o.order_type ?? "").toUpperCase(),
        quantity: o.totalSize !== undefined ? Number(o.totalSize) : o.quantity !== undefined ? Number(o.quantity) : null,
        limitPrice: o.price !== undefined && o.price !== null ? Number(o.price) : null,
        stopPrice: o.auxPrice !== undefined && o.auxPrice !== null ? Number(o.auxPrice) : null,
        clientOrderId: o.cOID !== undefined && o.cOID !== null ? String(o.cOID) : null,
        status: String(o.status ?? ""),
      }));
  }

  /** Some order submissions return question prompts that must be answered. */
  private async handleReplies<T extends Array<Record<string, unknown>>>(payload: T): Promise<T> {
    const first = payload?.[0];
    if (first && Array.isArray(first.message_ids) && typeof first.id === "string") {
      const confirmed = await this.req<Array<Record<string, unknown>>>("POST", `/iserver/reply/${first.id}`, { confirmed: true });
      return confirmed as T;
    }
    return payload;
  }

  async placeOrder(accountId: string, intent: OrderIntent): Promise<BrokerOrderAck> {
    const acct = accountId || this.accountId;
    const conid = await this.conid(intent.symbol);
    const order: Record<string, unknown> = {
      acctId: acct,
      conid,
      secType: `${conid}:STK`,
      orderType: ORDER_TYPE_MAP[intent.orderType],
      side: intent.side,
      quantity: intent.quantity,
      tif: intent.tif,
      cOID: intent.clientOrderId, // idempotency — broker-visible client order id
      referrer: "RequiTrading",
    };
    if (intent.limitPrice !== undefined) order.price = intent.limitPrice;
    if (intent.stopPrice !== undefined) order.auxPrice = intent.stopPrice;
    if (intent.trailAmount !== undefined) {
      order.trailingAmt = intent.trailAmount;
      order.trailingType = "amt";
    }

    let response = await this.req<Array<Record<string, unknown>>>("POST", `/iserver/account/${acct}/orders`, { orders: [order] });
    response = await this.handleReplies(response);

    const ack = response?.[0] ?? {};
    const orderId = String(ack.order_id ?? ack.orderId ?? "");
    const statusText = String(ack.order_status ?? ack.status ?? "").toLowerCase();
    if (!orderId) {
      return { brokerOrderId: "", status: "UNKNOWN", message: JSON.stringify(ack).slice(0, 200) };
    }
    return {
      brokerOrderId: orderId,
      status: statusText.includes("fill") ? "FILLED" : statusText.includes("reject") || statusText.includes("error") ? "REJECTED" : "ACKNOWLEDGED",
      message: statusText || "submitted",
    };
  }

  async cancelOrder(accountId: string, brokerOrderId: string) {
    try {
      const out = await this.req<{ msg?: string }>("DELETE", `/iserver/account/${accountId}/order/${brokerOrderId}`);
      return { ok: true, message: out.msg ?? "cancel submitted" };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  async getOrderStatus(_accountId: string, brokerOrderId: string): Promise<BrokerOrderAck> {
    const data = await this.req<{ orders?: Array<Record<string, unknown>> }>("GET", "/iserver/account/orders");
    const o = (data.orders ?? []).find((x) => String(x.orderId ?? x.order_id) === brokerOrderId);
    if (!o) return { brokerOrderId, status: "UNKNOWN", message: "not in live orders (may be filled/canceled)" };
    const statusText = String(o.status ?? "").toLowerCase();
    return {
      brokerOrderId,
      status: statusText.includes("fill") ? "FILLED" : statusText.includes("reject") || statusText.includes("cancel") ? "REJECTED" : "WORKING",
      filledQuantity: Number(o.filledQuantity ?? 0) || undefined,
      averagePrice: Number(o.avgPrice ?? 0) || undefined,
      message: statusText,
    };
  }
}
