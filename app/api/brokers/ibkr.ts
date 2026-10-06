import type { BrokerAdapter, BrokerAccount, BrokerCapabilities, BrokerOpenOrder, BrokerOrderAck, BrokerPosition, OrderIntent } from "./types";
import https from "node:https";
import { URL } from "node:url";

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

/** Read at call-time — Vite/HMR can import this module before dotenv finishes. */
function gatewayBase(): string {
  return (process.env.IBKR_GATEWAY_URL ?? "https://localhost:5000/v1/api").replace(/\/$/, "");
}
function defaultAccount(): string {
  return process.env.IBKR_ACCOUNT ?? "";
}

/** Client Portal Gateway ships a self-signed cert — Node fetch fails without this. */
function allowInsecureGatewayTls(): boolean {
  if (process.env.IBKR_GATEWAY_INSECURE_TLS === "0") return false;
  if (process.env.IBKR_GATEWAY_INSECURE_TLS === "1") return true;
  try {
    const host = new URL(gatewayBase()).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** CP Gateway returns 403 Access Denied when User-Agent is missing (Node https default). */
const GATEWAY_HEADERS: Record<string, string> = {
  Accept: "application/json",
  "User-Agent": "RequiTrading/1.0 (IBKR Client Portal)",
};

/** Shared CP Gateway HTTP client — self-signed TLS for localhost + required User-Agent. */
export async function ibkrGatewayFetch(
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const url = `${gatewayBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const baseHeaders = { ...GATEWAY_HEADERS, ...init?.headers };
  if (!allowInsecureGatewayTls()) {
    return fetch(url, { ...init, headers: baseHeaders });
  }
  // Local CP Gateway: accept self-signed cert (same as curl -k).
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyBuf = init?.body != null ? Buffer.from(init.body) : undefined;
    const headers: Record<string, string | number> = { ...baseHeaders };
    if (bodyBuf) {
      headers["Content-Length"] = bodyBuf.length;
    }
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: init?.method ?? "GET",
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve(
            new Response(body, {
              status: res.statusCode ?? 500,
              statusText: res.statusMessage,
            }),
          );
        });
      },
    );
    req.on("error", reject);
    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

const ORDER_TYPE_MAP: Record<string, string> = {
  MKT: "MKT",
  LMT: "LMT",
  STP: "STP",
  STP_LMT: "STP LMT",
  TRAIL: "TRAIL",
};

/** Parse CPAPI /trsrv/stocks payload → prefer US STK conid. */
function pickUsConidFromTrsrv(raw: unknown, symbol: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  // Flat array form (rare)
  if (Array.isArray(raw)) {
    const id = Number((raw[0] as { conid?: number })?.conid);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  const map = raw as Record<string, Array<{ contracts?: Array<{ conid?: number; isUS?: boolean; exchange?: string }> }>>;
  const key = Object.keys(map).find((k) => k.toUpperCase() === symbol.toUpperCase()) ?? Object.keys(map)[0];
  const contracts = map[key]?.[0]?.contracts ?? [];
  const us = contracts.find((c) => c.isUS) ?? contracts.find((c) => /NASDAQ|NYSE|ARCA|AMEX/i.test(String(c.exchange ?? ""))) ?? contracts[0];
  const id = us?.conid != null ? Number(us.conid) : NaN;
  return Number.isFinite(id) && id > 0 ? id : null;
}

export class IbkrBroker implements BrokerAdapter {
  readonly code = "IBKR" as const;
  readonly displayName = "Interactive Brokers (Client Portal API)";
  private conidCache = new Map<string, number>();
  private accountId: string;

  constructor(accountId: string = defaultAccount()) {
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
    const hasBody = body !== undefined;
    const res = await ibkrGatewayFetch(path, {
      method,
      headers: hasBody ? { "content-type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`IBKR ${method} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async healthCheck() {
    try {
      await this.ensureBrokerageBridge().catch(() => undefined);
      const status = await this.authStatus();
      if (status.authenticated && status.connected !== false) {
        return { ok: true, detail: "gateway authenticated · brokerage session live" };
      }
      if (status.authenticated) {
        return { ok: false, detail: "gateway authenticated but brokerage bridge not connected — open https://localhost:5000 and re-login, or retry Confirm" };
      }
      return { ok: false, detail: "gateway reachable but not authenticated — operator must log in to the Client Portal Gateway" };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  private async authStatus(): Promise<{ authenticated?: boolean; connected?: boolean; competing?: boolean }> {
    try {
      return await this.req<{ authenticated?: boolean; connected?: boolean; competing?: boolean }>("GET", "/iserver/auth/status");
    } catch {
      // Some gateway builds prefer POST.
      return await this.req<{ authenticated?: boolean; connected?: boolean; competing?: boolean }>("POST", "/iserver/auth/status", {});
    }
  }

  /**
   * CPAPI "no bridge" means SSO login exists but the trading bridge is down.
   * Re-init via ssodh/init + tickle + accounts warm-up before placing orders.
   */
  private async ensureBrokerageBridge(): Promise<void> {
    let status = await this.authStatus().catch(() => null);
    if (status?.authenticated && status.connected !== false) {
      await this.req("GET", "/iserver/accounts").catch(() => undefined);
      return;
    }

    try {
      await this.req("POST", "/iserver/auth/ssodh/init", { publish: true, compete: true });
    } catch {
      /* init can 500 while bridge is coming up — wait and re-check */
    }
    await new Promise((r) => setTimeout(r, 1200));
    await this.tickle().catch(() => undefined);
    await this.req("GET", "/iserver/accounts").catch(() => undefined);
    await new Promise((r) => setTimeout(r, 800));

    status = await this.authStatus().catch(() => null);
    if (!status?.authenticated) {
      throw new Error(
        "IBKR gateway not authenticated — open https://localhost:5000, complete login/2FA, then retry Confirm",
      );
    }
    if (status.connected === false) {
      try {
        await this.req("POST", "/iserver/auth/ssodh/init", { publish: true, compete: true });
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 1500));
      await this.req("GET", "/iserver/accounts").catch(() => undefined);
    }
  }

  private isNoBridgeError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return /no bridge/i.test(msg) || /HTTP 400.*bridge/i.test(msg);
  }

  /** Resolve a US stock symbol to an IBKR conid (cached). */
  private async conid(symbol: string): Promise<number> {
    const hit = this.conidCache.get(symbol);
    if (hit) return hit;

    // CPAPI /trsrv/stocks returns { SYMBOL: [ { contracts: [ { conid, exchange, isUS } ] } ] } — not a flat array.
    try {
      const raw = await this.req<unknown>("GET", `/trsrv/stocks?symbols=${encodeURIComponent(symbol)}`);
      const fromTrsrv = pickUsConidFromTrsrv(raw, symbol);
      if (fromTrsrv) {
        this.conidCache.set(symbol, fromTrsrv);
        return fromTrsrv;
      }
    } catch {
      // fall through to secdef search
    }

    const search = await this.req<Array<{ conid?: string | number; sections?: Array<{ secType?: string }> }>>(
      "GET",
      `/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`,
    );
    const stk = (search ?? []).find((row) => (row.sections ?? []).some((s) => String(s.secType).toUpperCase() === "STK")) ?? search?.[0];
    const id = stk?.conid != null ? Number(stk.conid) : NaN;
    if (!Number.isFinite(id) || id <= 0) throw new Error(`IBKR could not resolve symbol ${symbol} to a conid`);
    this.conidCache.set(symbol, id);
    return id;
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    const accounts = await this.req<Array<{ accountId?: string; id?: string; accountTitle?: string }>>("GET", "/portfolio/accounts");
    const rows = await Promise.all(
      (accounts ?? []).map(async (a) => {
        const accountId = String(a.accountId ?? a.id ?? "");
        const summary = accountId ? await this.accountSummary(accountId).catch(() => null) : null;
        return {
          accountId,
          label: String(a.accountTitle ?? "IBKR"),
          equity: summary?.equity ?? 0,
          cash: summary?.cash ?? 0,
          buyingPower: summary?.buyingPower ?? 0,
        };
      }),
    );
    return rows;
  }

  /** Keep the Client Portal Gateway session alive. Safe to call often. */
  async tickle(): Promise<{ ok: boolean; detail: string }> {
    try {
      const out = await this.req<{ iserver?: { authStatus?: { authenticated?: boolean } } }>("POST", "/tickle");
      const authenticated = out?.iserver?.authStatus?.authenticated === true;
      return {
        ok: authenticated,
        detail: authenticated ? "tickle ok · brokerage session live" : "tickle reached gateway but session is not authenticated",
      };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  private async accountSummary(accountId: string): Promise<{ equity: number; cash: number; buyingPower: number } | null> {
    // CPAPI returns either a tag array or a lowercase-keyed map of { amount, value }.
    const raw = await this.req<unknown>("GET", `/portfolio/${accountId}/summary`);
    const num = (tag: string): number => {
      if (Array.isArray(raw)) {
        const hit = (raw as Array<{ tag?: string; value?: string; amount?: number }>).find(
          (r) => String(r.tag ?? "").toLowerCase() === tag.toLowerCase(),
        );
        if (!hit) return 0;
        const n = hit.amount !== undefined ? Number(hit.amount) : Number(hit.value);
        return Number.isFinite(n) ? n : 0;
      }
      if (raw && typeof raw === "object") {
        const obj = raw as Record<string, { amount?: number | null; value?: string | null }>;
        const key = Object.keys(obj).find((k) => k.toLowerCase() === tag.toLowerCase());
        const hit = key ? obj[key] : undefined;
        if (!hit) return 0;
        const n = hit.amount != null ? Number(hit.amount) : Number(hit.value);
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };
    return {
      equity: num("NetLiquidation") || num("EquityWithLoanValue"),
      cash: num("TotalCashValue") || num("CashBalance"),
      buyingPower: num("BuyingPower") || num("AvailableFunds"),
    };
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
    let current = payload;
    // IBKR can return a chain of confirmation dialogs before the real order ack.
    for (let i = 0; i < 5; i++) {
      const first = current?.[0];
      if (!first || typeof first !== "object") break;
      const replyId = typeof first.id === "string" ? first.id : null;
      const hasPrompt =
        replyId &&
        (Array.isArray(first.message_ids) ||
          Array.isArray(first.messageIds) ||
          Array.isArray(first.message) ||
          first.confirm === false ||
          typeof first.message === "string");
      // Real order acks have order_id / orderId — don't treat those as prompts.
      if (first.order_id != null || first.orderId != null) break;
      if (!hasPrompt || !replyId) break;
      current = (await this.req<Array<Record<string, unknown>>>("POST", `/iserver/reply/${replyId}`, {
        confirmed: true,
      })) as T;
    }
    return current;
  }

  async placeOrder(accountId: string, intent: OrderIntent): Promise<BrokerOrderAck> {
    const acct = accountId || this.accountId;
    assertIbkrPaperUnlessLiveUnlocked(acct);
    await this.ensureBrokerageBridge();
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

    const submit = async () => {
      let response = await this.req<Array<Record<string, unknown>>>("POST", `/iserver/account/${acct}/orders`, { orders: [order] });
      return this.handleReplies(response);
    };

    let response: Array<Record<string, unknown>>;
    try {
      response = await submit();
    } catch (e) {
      if (!this.isNoBridgeError(e)) throw e;
      // Bridge dropped mid-session — re-init once and retry the same order (same cOID for idempotency).
      await this.ensureBrokerageBridge();
      try {
        response = await submit();
      } catch (e2) {
        if (this.isNoBridgeError(e2)) {
          throw new Error(
            'IBKR "no bridge" — brokerage session not connected. Restart Client Portal Gateway, log in at https://localhost:5000 (2FA), then retry Confirm.',
          );
        }
        throw e2;
      }
    }

    const ack = response?.[0] ?? {};
    const orderId = String(ack.order_id ?? ack.orderId ?? "");
    const statusText = String(ack.order_status ?? ack.status ?? "").toLowerCase();
    if (!orderId) {
      return { brokerOrderId: "", status: "UNKNOWN", message: JSON.stringify(ack).slice(0, 200) };
    }
    let result: BrokerOrderAck = {
      brokerOrderId: orderId,
      status: statusText.includes("fill") ? "FILLED" : statusText.includes("reject") || statusText.includes("error") ? "REJECTED" : "ACKNOWLEDGED",
      message: statusText || "submitted",
      filledQuantity: Number(ack.filledQuantity ?? ack.filled_quantity ?? 0) || undefined,
      averagePrice: Number(ack.avgPrice ?? ack.average_price ?? 0) || undefined,
    };

    // CPAPI usually ACKs first; paper often fills within ~1–3s. Poll so confirm→recordFill can populate Positions.
    if (result.status === "ACKNOWLEDGED") {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const st = await this.getOrderStatus(acct, orderId);
          if (st.status === "FILLED" || st.status === "REJECTED") return st;
        } catch {
          /* keep ACKNOWLEDGED */
        }
      }
      // Final fallback: position already in the portfolio (common when /orders drops the row after fill).
      try {
        const pos = await this.getPositions(acct);
        const hit = pos.find((p) => String(p.symbol).toUpperCase() === intent.symbol.toUpperCase() && Number(p.quantity) !== 0);
        if (hit) {
          return {
            brokerOrderId: orderId,
            status: "FILLED",
            filledQuantity: Math.min(intent.quantity, Math.abs(Number(hit.quantity)) || intent.quantity),
            averagePrice: Number(hit.averageCost) || intent.limitPrice || undefined,
            message: "filled (inferred from IBKR position)",
          };
        }
      } catch {
        /* keep ACKNOWLEDGED */
      }
    }
    return result;
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
    if (o) {
      const statusText = String(o.status ?? "").toLowerCase();
      const filledQty = Number(o.filledQuantity ?? o.filled_quantity ?? 0) || 0;
      const filled = statusText.includes("fill") || filledQty > 0;
      return {
        brokerOrderId,
        status: filled ? "FILLED" : statusText.includes("reject") || statusText.includes("cancel") ? "REJECTED" : "WORKING",
        filledQuantity: filledQty || undefined,
        averagePrice: Number(o.avgPrice ?? o.averagePrice ?? 0) || undefined,
        message: statusText,
      };
    }
    // Not in live book — check recent trades (filled orders drop out of /orders quickly).
    try {
      const trades = await this.req<Array<Record<string, unknown>>>("GET", "/iserver/account/trades");
      const t = (trades ?? []).find(
        (x) => String(x.order_id ?? x.orderId ?? x.order_ref ?? "") === brokerOrderId,
      );
      if (t) {
        return {
          brokerOrderId,
          status: "FILLED",
          filledQuantity: Number(t.size ?? t.quantity ?? t.filledQuantity ?? 0) || undefined,
          averagePrice: Number(t.price ?? t.avgPrice ?? 0) || undefined,
          message: "filled (from trades)",
        };
      }
    } catch {
      /* ignore */
    }
    return { brokerOrderId, status: "UNKNOWN", message: "not in live orders (may be filled/canceled)" };
  }
}

/** True when operator has configured a target IBKR account id. */
export function isIbkrAccountConfigured(): boolean {
  return Boolean(configuredIbkrAccountId());
}

export function configuredIbkrAccountId(): string {
  return process.env.IBKR_ACCOUNT?.trim() ?? "";
}

/** IBKR paper accounts are DU…; live accounts are typically U…. */
export function isIbkrPaperAccountId(accountId: string): boolean {
  return /^DU/i.test(accountId.trim());
}

export function isLiveTradingUnlocked(): boolean {
  const v = process.env.LIVE_TRADING_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1";
}

/** Paper-first: refuse live IBKR account ids until an explicit live flag is set. */
export function assertIbkrPaperUnlessLiveUnlocked(accountId: string): void {
  const id = accountId.trim();
  if (!id) throw new Error("IBKR account id is missing — set IBKR_ACCOUNT to a paper id (DU…).");
  if (isIbkrPaperAccountId(id)) return;
  if (isLiveTradingUnlocked()) return;
  throw new Error(
    `IBKR account ${id} is not a paper account (DU…). Live trading is locked until LIVE_TRADING_ENABLED=true.`,
  );
}

export function isIbkrBrokerAccount(brokerName: string | null | undefined): boolean {
  const b = (brokerName ?? "").toUpperCase();
  return b === "IBKR" || b.includes("INTERACTIVE");
}
