import type { Bar } from "./indicators";

/**
 * IBKR MARKET DATA — Client Portal Web API (CPAPI) market-data endpoints.
 *
 * Shares the gateway connection with the broker adapter (IBKR_GATEWAY_URL).
 * One IBKR gateway session serves both trading and market data — with a
 * funded account, 1-minute history and snapshots are real-time (subject to
 * the account's market-data subscriptions).
 *
 * Endpoints used:
 *   - GET /trsrv/stocks?symbols=...            symbol → conid resolution
 *   - GET /iserver/marketdata/history          1-min OHLCV bars
 *     ?conid=X&period=2d&bar=1min&outsideRth=false
 *   - GET /iserver/auth/status                 gateway/session health
 *
 * Credentials note (same as the broker adapter): the operator authenticates
 * the Client Portal Gateway out-of-band; this module never logs in
 * programmatically. All failures surface as structured errors — the data
 * service degrades honestly rather than fabricating bars.
 */

import { ibkrGatewayFetch } from "../brokers/ibkr";

const conidCache = new Map<string, number>();

async function req<T>(path: string): Promise<T> {
  const res = await ibkrGatewayFetch(path, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IBKR marketdata GET ${path} → HTTP ${res.status} ${text.slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

export interface GatewayHealth {
  ok: boolean;
  detail: string;
}

/** Short TTL so the 2.5s autonomous tick does not hammer /iserver/auth/status. */
let healthCache: { at: number; value: GatewayHealth } | null = null;
const HEALTH_CACHE_MS = 5_000;

export async function gatewayHealth(): Promise<GatewayHealth> {
  if (healthCache && Date.now() - healthCache.at < HEALTH_CACHE_MS) {
    return healthCache.value;
  }
  try {
    const status = await req<{ authenticated?: boolean; connected?: boolean }>("/iserver/auth/status");
    const value: GatewayHealth = status.authenticated
      ? { ok: true, detail: "gateway authenticated · market data live" }
      : { ok: false, detail: "gateway reachable but not authenticated — operator must log in to the Client Portal Gateway" };
    healthCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    const value = { ok: false, detail: (e as Error).message };
    // Cache failures briefly too so a single blip does not trip every concurrent caller.
    healthCache = { at: Date.now(), value };
    return value;
  }
}

/** Resolve a US stock symbol to an IBKR conid (cached). */
export async function resolveConid(symbol: string): Promise<number> {
  const key = symbol.toUpperCase();
  const hit = conidCache.get(key);
  if (hit) return hit;

  const raw = await req<unknown>(`/trsrv/stocks?symbols=${encodeURIComponent(key)}`);
  let id: number | null = null;
  if (Array.isArray(raw)) {
    id = Number((raw[0] as { conid?: number })?.conid) || null;
  } else if (raw && typeof raw === "object") {
    const map = raw as Record<string, Array<{ contracts?: Array<{ conid?: number; isUS?: boolean }> }>>;
    const entry = map[key] ?? map[Object.keys(map)[0]];
    const contracts = entry?.[0]?.contracts ?? [];
    const us = contracts.find((c) => c.isUS) ?? contracts[0];
    id = us?.conid != null ? Number(us.conid) : null;
  }
  if (!id || !Number.isFinite(id)) {
    // Fallback: secdef search
    const search = await req<Array<{ conid?: string | number; sections?: Array<{ secType?: string }> }>>(
      `/iserver/secdef/search?symbol=${encodeURIComponent(key)}`,
    );
    const stk = (search ?? []).find((row) => (row.sections ?? []).some((s) => String(s.secType).toUpperCase() === "STK")) ?? search?.[0];
    id = stk?.conid != null ? Number(stk.conid) : null;
  }
  if (!id || !Number.isFinite(id)) throw new Error(`IBKR could not resolve symbol ${key} to a conid`);
  conidCache.set(key, id);
  return id;
}

interface IbkrHistoryBar {
  t?: number; // epoch ms
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

interface IbkrHistoryResponse {
  data?: IbkrHistoryBar[];
  points?: number;
  mktDataDelay?: number; // seconds of delay if data is delayed rather than real-time
}

export interface HistoryResult {
  symbol: string;
  conid: number;
  bars: Bar[];
  /** reported feed delay in seconds; 0/undefined = real-time */
  delaySeconds: number;
}

/**
 * Pull 1-minute OHLCV bars for a symbol. `period`/`bar` follow CPAPI
 * conventions ("1d"/"2d"/"1w", bar "1min"). outsideRth=false keeps the feed
 * regular-hours only, matching the indicator engine's RTH sessions.
 */
export async function fetchMinuteBars(symbol: string, period = "2d"): Promise<HistoryResult> {
  const conid = await resolveConid(symbol);
  const out = await req<IbkrHistoryResponse>(
    `/iserver/marketdata/history?conid=${conid}&period=${encodeURIComponent(period)}&bar=1min&outsideRth=false`,
  );
  const bars: Bar[] = (out.data ?? [])
    .filter((b) => typeof b.t === "number" && typeof b.c === "number")
    .map((b) => ({
      t: b.t as number,
      o: Number(b.o ?? b.c),
      h: Number(b.h ?? b.c),
      l: Number(b.l ?? b.c),
      c: Number(b.c),
      v: Number(b.v ?? 0),
    }))
    .sort((a, z) => a.t - z.t);
  return {
    symbol: symbol.toUpperCase(),
    conid,
    bars,
    delaySeconds: Number(out.mktDataDelay ?? 0),
  };
}
