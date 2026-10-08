/**
 * Intelligence → IBKR Paper natural-language helpers (additive).
 * Does not alter research/CHAT routing. Staging still requires CONFIRM ORDER.
 */
import { cancelTicket, listTickets, proposeTicket, rejectTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";
import { listPositions } from "../engine/portfolio";
import { ibkrPaperStatus } from "../brokers/ibkr-paper";
import {
  assertIbkrPaperUnlessLiveUnlocked,
  configuredIbkrAccountId,
  IbkrBroker,
  isIbkrPaperAccountId,
} from "../brokers/ibkr";
import { resolveBroker, type BrokerCode } from "../brokers/registry";
import { getSnapshot } from "../marketdata/gateway/gateway";
import { clearThreadState, setThreadState } from "./intent";
import { resolveTradeSymbol } from "./trade-symbol";

/** True when the user is asking for live book / holdings / cash (not research). */
export function isPortfolioStatusAsk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/\b(buy|sell|flatten|exit|close)\b/i.test(t) && !/\?/.test(t) && !/\b(show|what|how much|list)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(buying\s*power|cash|balance|equity|nav|account)\b/i.test(t) ||
    /\b(positions?|holdings?|portfolio|what'?s\s+open|pnl|p&l|exposure)\b/i.test(t) ||
    /\bwhat\s+(?:do\s+)?i\s+have\b/i.test(t) ||
    /\bwhat\s+am\s+i\s+holding\b/i.test(t) ||
    /\b(?:my\s+|current\s+)(?:holdings?|positions?|portfolio)\b/i.test(t) ||
    /\bshow\s+(?:me\s+)?(?:my\s+)?(?:open\s+)?(?:positions?|holdings?|portfolio)\b/i.test(t) ||
    /^what\s+i\s+have\b/i.test(t)
  );
}

export type ExplicitStageInput = {
  userId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  lastPrice: number;
  conversationId?: string;
  /** Absolute limit; if omitted uses lastPrice as LMT (paper-friendly). */
  limitPrice?: number;
  /** Protective stop absolute price */
  stop?: number;
  /** Optional take-profit absolute (stored on ticket.target) */
  target?: number;
  /** Prefer MKT when user said "market"; STP for protective / breakeven stops */
  orderType?: "MKT" | "LMT" | "TRAIL" | "STP";
  trailAmount?: number;
  strategy?: string;
};

export type ExplicitStageResult =
  | { ok: true; reply: string; ticketId: string }
  | { ok: false; reply: string };

/** Stop loss percent from "with a 2% stop" / "2 percent stop loss". */
export function parseStopLossPct(text: string): number | null {
  const m =
    text.match(/\b(\d+(?:\.\d+)?)\s*%\s*(?:stop(?:\s*loss)?|sl)\b/i) ??
    text.match(/\b(?:stop(?:\s*loss)?|sl)\s*(?:of|at|@)?\s*(\d+(?:\.\d+)?)\s*%/i) ??
    text.match(/\bwith\s+a\s+(\d+(?:\.\d+)?)\s*%\s*stop\b/i);
  if (!m) return null;
  const pct = Number.parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 50) return null;
  return pct;
}

/** Trailing stop percent: "trail by 3%" / "trailing stop 3%". */
export function parseTrailPct(text: string): number | null {
  const m =
    text.match(/\btrail(?:ing)?\s+(?:it\s+)?(?:by\s+)?(\d+(?:\.\d+)?)\s*%/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*%\s*trail(?:ing)?\s*stop\b/i) ??
    text.match(/\bmake\s+it\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*%\s*trail/i);
  if (!m) return null;
  const pct = Number.parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 50) return null;
  return pct;
}

/** Take-profit percent: "take profit at 8%" / "5% take profit" / "TP 8%". */
export function parseTakeProfitPct(text: string): number | null {
  const m =
    text.match(/\b(?:take\s*profit|tp)\s+(?:at\s+|@\s+)?(\d+(?:\.\d+)?)\s*%/i) ??
    text.match(/\b(\d+(?:\.\d+)?)\s*%\s*(?:take\s*profit|tp)\b/i) ??
    text.match(/\btake\s+profit\s+on\s+(?:half|quarter|\d+\s*%).{0,24}?(\d+(?:\.\d+)?)\s*%/i);
  if (!m) return null;
  const pct = Number.parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return null;
  return pct;
}

export function isCancelWorkingOrderIntent(text: string): boolean {
  return (
    /\bcancel\s+(?:all\s+)?(?:my\s+|the\s+|open\s+)?(?:orders?|order)\b/i.test(text) ||
    /\bcancel\s+(?:my\s+|the\s+)?(?:open\s+)?[A-Za-z.]{1,12}\s+order\b/i.test(text) ||
    /\bcancel\s+(?:my\s+|the\s+)?open\s+[A-Za-z.]{1,12}\b/i.test(text)
  );
}

export function isCancelAllOrdersIntent(text: string): boolean {
  return /\bcancel\s+all\b/i.test(text) && /\b(order|orders|working|open)\b/i.test(text);
}

export function isStopToBreakevenIntent(text: string): boolean {
  return (
    /\b(?:move\s+(?:my\s+)?stop|stop\s*(?:loss)?)\s+(?:loss\s+)?(?:to\s+)?breakeven\b/i.test(text) ||
    /\bstop\s+to\s+breakeven\b/i.test(text) ||
    /\bbreakeven\s+stop\b/i.test(text)
  );
}

export function isTakeProfitIntent(text: string): boolean {
  return /\btake\s*profit\b/i.test(text) || /\btp\s+(?:at|@|\d)/i.test(text);
}

export function isFollowUpProtectiveStopIntent(text: string): boolean {
  return (
    /\badd\s+(?:a\s+)?\d+(?:\.\d+)?\s*%\s*stop\b/i.test(text) ||
    /\b(?:put|set|place)\s+(?:a\s+)?\d+(?:\.\d+)?\s*%\s*stop\b/i.test(text) ||
    (/\bstop\b/i.test(text) && parseStopLossPct(text) != null && !/\bbuy\b|\bsell\b/i.test(text))
  );
}

export function isMakeTrailingStopIntent(text: string): boolean {
  return (
    /\bmake\s+it\s+(?:a\s+)?trail(?:ing)?(?:\s+stop)?\b/i.test(text) ||
    /\b(?:switch|change)\s+(?:it\s+)?to\s+(?:a\s+)?trail(?:ing)?(?:\s+stop)?\b/i.test(text) ||
    (/\btrail(?:ing)?\s+stop\b/i.test(text) && !/\bbuy\b|\bsell\b/i.test(text))
  );
}

export function isSellProfitableIntent(text: string): boolean {
  return (
    /\bsell\s+(?:all\s+)?(?:my\s+)?profit(?:able)?(?:\s+positions?)?\b/i.test(text) ||
    /\bclose\s+(?:all\s+)?profit(?:able)?(?:\s+positions?)?\b/i.test(text) ||
    /\bsell\s+winners\b/i.test(text)
  );
}

/** Limit price: "at $390" / "limit 225" / "or better". */
export function parseLimitPrice(text: string): number | null {
  const m =
    text.match(/\b(?:limit|lmt)\s+(?:order\s+)?(?:at\s+|@\s+)?\$?\s*([\d,]+(?:\.\d+)?)/i) ??
    text.match(/\bat\s+\$\s*([\d,]+(?:\.\d+)?)\s*(?:or\s+better)?/i) ??
    text.match(/\b@\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return null;
  const n = Number.parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Fraction of position: half → 0.5, 25% → 0.25, all/entire → 1. */
export function parsePositionFraction(text: string): number | null {
  if (/\b(half|½)\b/i.test(text) || /50\s*%/i.test(text)) return 0.5;
  if (/\bquarter\b/i.test(text) || /25\s*%/i.test(text)) return 0.25;
  if (/\b(third|1\/3)\b/i.test(text)) return 1 / 3;
  const pct = text.match(/(\d+(?:\.\d+)?)\s*%/i);
  if (pct) {
    const n = Number.parseFloat(pct[1]);
    if (Number.isFinite(n) && n > 0 && n <= 100) return n / 100;
  }
  if (
    /\b(flatten|close\s+entire|sell\s+all|entire\s+position)\b/i.test(text) ||
    /\bclose\s+(?:my\s+|the\s+)?(?:[A-Za-z.]{1,12}\s+)?position\b/i.test(text) ||
    /\bclose\s+(?:my\s+|the\s+)?[A-Za-z.]{1,12}\b/i.test(text) ||
    /\b(all|entire)\b/i.test(text)
  ) {
    return 1;
  }
  return null;
}

export function stopFromPct(side: "BUY" | "SELL", entry: number, pct: number): number {
  const f = pct / 100;
  return +(side === "BUY" ? entry * (1 - f) : entry * (1 + f)).toFixed(2);
}

export function isPaperIntelligenceVenue(broker: BrokerCode, accountId: string | undefined): boolean {
  if (broker === "PAPER") return true;
  if (broker === "IBKR" && accountId && isIbkrPaperAccountId(accountId)) return true;
  return false;
}

/**
 * Resolve sell quantity from open holdings when user says half / % / close,
 * and always cap explicit share counts to what is actually open.
 */
export async function resolveSellQtyFromHoldings(
  userId: string,
  symbol: string,
  text: string,
  explicitQty: number | null,
): Promise<{ quantity: number | null; note: string | null }> {
  const open = await listPositions(userId, 100);
  const pos = open.find(
    (p) => p.status === "OPEN" && p.symbol.toUpperCase() === symbol.toUpperCase() && p.quantity > 0,
  );
  if (!pos) {
    return {
      quantity: null,
      note: `No open **${symbol.toUpperCase()}** position to sell. Nothing was staged.`,
    };
  }

  const frac = parsePositionFraction(text);
  if (frac != null) {
    const qty = Math.max(1, Math.floor(pos.quantity * frac));
    const capped = Math.min(qty, pos.quantity);
    return {
      quantity: capped,
      note: `Sized from holdings: ${pos.quantity} open → sell ${capped} (${Math.round(frac * 100)}%).`,
    };
  }

  if (explicitQty != null && explicitQty > 0) {
    if (explicitQty > pos.quantity) {
      return {
        quantity: pos.quantity,
        note: `You only hold **${pos.quantity}** ${symbol.toUpperCase()} — capped sell from ${explicitQty} → **${pos.quantity}**.`,
      };
    }
    return { quantity: explicitQty, note: null };
  }

  // Close / sell with no size → full position
  if (/\b(close|flatten|exit|sell)\b/i.test(text)) {
    return {
      quantity: pos.quantity,
      note: `Closing full **${symbol.toUpperCase()}** position (${pos.quantity} shares).`,
    };
  }

  return { quantity: null, note: null };
}

/** Stage an explicit user-sized paper ticket (bypass scanner FAVORABLE). CONFIRM still required. */
export async function stageExplicitIntelligenceOrder(
  input: ExplicitStageInput,
): Promise<ExplicitStageResult> {
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) {
    return { ok: false, reply: "Invalid quantity — nothing was staged." };
  }
  if (!(input.lastPrice > 0)) {
    return { ok: false, reply: "No verified last price — nothing was staged." };
  }

  const { broker, accountId, note } = await resolveIntelligenceBroker(input.userId);
  if (!isPaperIntelligenceVenue(broker, accountId)) {
    return {
      ok: false,
      reply:
        `Live IBKR venue is locked for Intelligence until paper path is forced.\n` +
        `Set **INTELLIGENCE_BROKER=IBKR** with a **DU…** paper account, or keep paperOnly.\n` +
        `Nothing was staged. (${note})`,
    };
  }
  if (broker === "IBKR" && accountId) {
    try {
      assertIbkrPaperUnlessLiveUnlocked(accountId);
    } catch (e) {
      return { ok: false, reply: `${(e as Error).message}\n\nNothing was staged.` };
    }
  }

  const limit = input.limitPrice ?? input.lastPrice;
  const orderType = input.orderType ?? "LMT";
  const stop =
    input.stop ??
    (orderType === "TRAIL" || orderType === "MKT"
      ? undefined
      : stopFromPct(input.side, input.lastPrice, 1));
  const trailAmount =
    orderType === "TRAIL"
      ? input.trailAmount ??
        (input.stop != null ? Math.abs(input.lastPrice - input.stop) : undefined)
      : undefined;

  try {
    const res = await proposeTicket(input.userId, {
      strategy: input.strategy ?? "INTELLIGENCE_NL",
      broker,
      accountId,
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      quantity: Math.max(1, Math.floor(input.quantity)),
      orderType,
      limitPrice: orderType === "MKT" || orderType === "TRAIL" || orderType === "STP" ? undefined : limit,
      stop: orderType === "TRAIL" ? undefined : stop,
      stopPrice: orderType === "TRAIL" ? undefined : stop,
      trailAmount: orderType === "TRAIL" ? trailAmount : undefined,
      entry: input.lastPrice,
      target:
        input.target ??
        (input.limitPrice != null && input.side === "SELL" ? input.limitPrice : undefined),
      origin: "INTELLIGENCE",
    });
    const t = res.ticket;
    clearThreadState(input.userId, input.conversationId);
    setThreadState(
      input.userId,
      {
        stagedTicketId: t.ticketId,
        stagedExpiresAt: Date.now() + 5 * 60_000,
      },
      input.conversationId,
    );

    const trailNote =
      orderType === "TRAIL" && trailAmount != null
        ? ` · trail $${trailAmount.toFixed(2)}`
        : stop != null
          ? ` · stop ${stop}`
          : "";

    return {
      ok: true,
      ticketId: t.ticketId,
      reply:
        `Staged for **IBKR Paper** — ticket **${t.ticketId}**.\n\n` +
        `· ${t.symbol} ${t.side} ${t.quantity} @ ${t.orderType}` +
        `${t.limitPrice != null ? ` ${t.limitPrice}` : ""}` +
        `${trailNote}\n` +
        `· Venue: ${t.effectiveBroker ?? t.broker}${res.degradedNote ? ` (${res.degradedNote})` : ""}\n` +
        `· Policy: ${note}\n\n` +
        `Reply exactly **CONFIRM ORDER ${t.ticketId}** to send to IBKR Paper, or **REJECT ORDER ${t.ticketId}** to cancel.\n` +
        `Nothing reaches the broker until you confirm.`,
    };
  } catch (e) {
    return {
      ok: false,
      reply: `I couldn't stage that ticket: ${(e as Error).message}. Nothing was staged.`,
    };
  }
}

/**
 * Stage one SELL ticket per OPEN holding (paper). Each ticket still needs its own CONFIRM ORDER.
 */
export async function stageCloseAllPositions(
  userId: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const open = (await listPositions(userId, 100)).filter(
    (p) => p.status === "OPEN" && p.quantity > 0,
  );
  if (open.length === 0) {
    return {
      ok: false,
      reply: "You have **no open positions** to close. Nothing was staged.",
    };
  }

  const { broker, accountId, note } = await resolveIntelligenceBroker(userId);
  if (!isPaperIntelligenceVenue(broker, accountId)) {
    return {
      ok: false,
      reply:
        `Live venue is locked for Intelligence close-all.\n` +
        `Use IBKR Paper (\`DU…\` + INTELLIGENCE_BROKER=IBKR). Nothing was staged. (${note})`,
    };
  }
  if (broker === "IBKR" && accountId) {
    try {
      assertIbkrPaperUnlessLiveUnlocked(accountId);
    } catch (e) {
      return { ok: false, reply: `${(e as Error).message}\n\nNothing was staged.` };
    }
  }

  const lines: string[] = [];
  const ticketIds: string[] = [];
  const failures: string[] = [];

  for (const p of open) {
    const entry = Number.parseFloat(String(p.avgEntry));
    const last = entry > 0 ? entry : 0;
    if (!(last > 0)) {
      failures.push(`${p.symbol}: no usable entry/price`);
      continue;
    }
    const staged = await stageExplicitIntelligenceOrder({
      userId,
      symbol: p.symbol,
      side: "SELL",
      quantity: p.quantity,
      lastPrice: last,
      conversationId: opts?.conversationId,
      stop: stopFromPct("SELL", last, 1),
      orderType: "LMT",
      strategy: "INTELLIGENCE_NL",
    });
    if (staged.ok) {
      ticketIds.push(staged.ticketId);
      lines.push(`· **SELL ${p.quantity} ${p.symbol}** → \`CONFIRM ORDER ${staged.ticketId}\``);
    } else {
      failures.push(`${p.symbol}: ${staged.reply.split("\n")[0]}`);
    }
  }

  if (ticketIds.length === 0) {
    return {
      ok: false,
      reply:
        `Could not stage close-all tickets.\n\n` +
        failures.map((f) => `· ${f}`).join("\n") +
        `\n\nNothing was staged.`,
    };
  }

  clearThreadState(userId, opts?.conversationId);

  return {
    ok: true,
    reply:
      `Staged **${ticketIds.length}** SELL ticket(s) to close your open holdings (paper).\n\n` +
      lines.join("\n") +
      `\n\n· Venue policy: ${note}` +
      `\n· Reply **each** \`CONFIRM ORDER …\` line to send that sell (or Reject).` +
      `\n· Nothing reaches the broker until you confirm.` +
      (failures.length
        ? `\n\nSkipped:\n${failures.map((f) => `· ${f}`).join("\n")}`
        : ""),
  };
}

/** Deterministic account / positions / BP reply for STATUS_QUERY (IBKR Paper when connected). */
export async function formatIntelligenceAccountStatus(userId: string, text: string): Promise<string | null> {
  if (!isPortfolioStatusAsk(text)) return null;

  const [ibkr, positions] = await Promise.all([
    ibkrPaperStatus(userId).catch(() => null),
    listPositions(userId, 50).catch(() => []),
  ]);
  const open = positions.filter((p) => p.status === "OPEN");
  const lines: string[] = [];

  if (ibkr?.gatewayOk && ibkr.accountId) {
    lines.push(
      `**IBKR Paper** (${ibkr.accountId})`,
      `· Equity / NAV: $${Number(ibkr.equity || 0).toLocaleString()}`,
      `· Cash: $${Number(ibkr.cash || 0).toLocaleString()}`,
      `· Buying power: $${Number(ibkr.buyingPower || 0).toLocaleString()}`,
    );
  } else {
    lines.push(
      `**IBKR Paper gateway:** ${ibkr?.detail ?? "not connected"}`,
      `Connect / re-auth Client Portal Gateway for live balances.`,
    );
  }

  // Prefer ledger; if empty, also surface live IBKR gateway holdings.
  type Row = { symbol: string; quantity: number; avgEntry: string; source: string };
  const rows: Row[] = open.map((p) => ({
    symbol: p.symbol,
    quantity: p.quantity,
    avgEntry: String(p.avgEntry),
    source: p.broker || p.strategy || "ledger",
  }));

  if (rows.length === 0 && ibkr?.gatewayOk && ibkr.accountId) {
    try {
      const acct = ibkr.accountId || configuredIbkrAccountId();
      const brokerPos = await new IbkrBroker(acct).getPositions(acct);
      for (const p of brokerPos) {
        if (!p.symbol || !(Number(p.quantity) > 0)) continue;
        rows.push({
          symbol: String(p.symbol).toUpperCase(),
          quantity: Math.abs(Number(p.quantity)),
          avgEntry: String(p.averageCost ?? "—"),
          source: "IBKR gateway",
        });
      }
    } catch {
      /* keep ledger-only reply */
    }
  }

  if (rows.length === 0) {
    lines.push(`\nOpen positions: **none** (ledger + IBKR gateway).`);
  } else {
    lines.push(`\nOpen positions (${rows.length}):`);
    for (const p of rows.slice(0, 25)) {
      lines.push(`· ${p.symbol} ${p.quantity} @ ${p.avgEntry} · ${p.source}`);
    }
  }

  lines.push(`\n_Live book snapshot from Requi — not a guess. Say "buy …" only if you want to stage a trade._`);
  return lines.join("\n");
}

async function assertPaperVenue(
  userId: string,
): Promise<{ ok: true; broker: BrokerCode; accountId: string | undefined; note: string } | { ok: false; reply: string }> {
  const { broker, accountId, note } = await resolveIntelligenceBroker(userId);
  if (!isPaperIntelligenceVenue(broker, accountId)) {
    return {
      ok: false,
      reply:
        `Live venue is locked for Intelligence order management.\n` +
        `Use IBKR Paper (\`DU…\` + INTELLIGENCE_BROKER=IBKR). Nothing changed. (${note})`,
    };
  }
  if (broker === "IBKR" && accountId) {
    try {
      assertIbkrPaperUnlessLiveUnlocked(accountId);
    } catch (e) {
      return { ok: false, reply: `${(e as Error).message}\n\nNothing changed.` };
    }
  }
  return { ok: true, broker, accountId, note };
}

async function resolveManageSymbol(
  userId: string,
  text: string,
  conversationId?: string,
): Promise<string | null> {
  const fromText = resolveTradeSymbol(text, {
    advisory: null,
    stagedTicketId: null,
    stagedExpiresAt: null,
    pendingQuantity: null,
    awaitingQuantityFor: null,
  });
  if (fromText) return fromText.toUpperCase();

  // "Cancel my open Apple order" / "stop on NVDA" — company names or tickers in manage phrases.
  const cancelSym = text.match(
    /\b(?:cancel|stop|trail|profit|breakeven).*?\b([A-Za-z.]{1,12})\b(?:\s+order)?/i,
  );
  if (cancelSym) {
    const token = cancelSym[1];
    if (!/^(my|the|open|all|orders?|stop|loss|to|a|an|half|on|at|by|it|instead)$/i.test(token)) {
      const { resolveSymbolsFromText } = await import("../intelligence-data/symbol-resolver");
      const hit = resolveSymbolsFromText(token)[0] ?? (/^[A-Za-z]{1,5}$/.test(token) ? token.toUpperCase() : null);
      if (hit) return hit.toUpperCase();
    }
  }

  const open = (await listPositions(userId, 50)).filter((p) => p.status === "OPEN" && p.quantity > 0);
  if (open.length === 1) return open[0].symbol.toUpperCase();

  const tickets = await listTickets(userId, 40);
  const recent = tickets.find(
    (t) =>
      ["READY_FOR_CONFIRMATION", "WORKING", "PARTIALLY_FILLED", "BROKER_ACK", "FILLED"].includes(t.state) &&
      t.strategy?.startsWith("INTELL"),
  );
  if (recent) return recent.symbol.toUpperCase();

  void conversationId;
  return null;
}

/** Cancel staged READY tickets and/or working broker orders (by symbol or all). */
export async function cancelOrdersFromNl(
  userId: string,
  text: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const venue = await assertPaperVenue(userId);
  if (!venue.ok) return venue;

  const all = isCancelAllOrdersIntent(text);
  const symbol = all ? null : await resolveManageSymbol(userId, text, opts?.conversationId);
  if (!all && !symbol) {
    return {
      ok: false,
      reply: `Which symbol's order should I cancel? e.g. "Cancel my open AAPL order" or "Cancel all open orders".`,
    };
  }

  const tickets = await listTickets(userId, 100);
  const match = (sym: string) => !symbol || sym.toUpperCase() === symbol;

  const lines: string[] = [];
  let canceled = 0;

  for (const t of tickets) {
    if (!match(t.symbol)) continue;
    if (t.state === "READY_FOR_CONFIRMATION") {
      const res = await rejectTicket(userId, t.ticketId);
      if (res.ok) {
        canceled += 1;
        lines.push(`· Rejected staged **${t.ticketId}** (${t.symbol} ${t.side})`);
      }
    } else if (["WORKING", "PARTIALLY_FILLED", "BROKER_ACK"].includes(t.state)) {
      const res = await cancelTicket(userId, t.ticketId);
      if (res.ok) {
        canceled += 1;
        lines.push(`· Cancel submitted for **${t.ticketId}** (${t.symbol} · broker ${t.brokerOrderId ?? "—"})`);
      } else {
        lines.push(`· Failed **${t.ticketId}**: ${res.message}`);
      }
    }
  }

  // Also cancel broker open orders that may not have a matching WORKING ticket row.
  try {
    const { adapter } = resolveBroker(venue.broker);
    const acct = venue.accountId ?? (await adapter.getAccounts())[0]?.accountId ?? "";
    if (acct && adapter.getOpenOrders) {
      const open = await adapter.getOpenOrders(acct);
      for (const o of open) {
        if (!o.brokerOrderId) continue;
        if (symbol && (o.symbol ?? "").toUpperCase() !== symbol) continue;
        // Skip if we already canceled via ticket with same brokerOrderId
        if (tickets.some((t) => t.brokerOrderId === o.brokerOrderId && t.state === "CANCELED")) continue;
        const res = await adapter.cancelOrder(acct, o.brokerOrderId);
        if (res.ok) {
          canceled += 1;
          lines.push(`· Cancel submitted for broker order **${o.brokerOrderId}** (${o.symbol ?? "?"})`);
        }
      }
    }
  } catch {
    /* ticket path is enough when gateway open-orders fails */
  }

  if (canceled === 0) {
    return {
      ok: false,
      reply: symbol
        ? `No staged or working **${symbol}** orders to cancel.`
        : `No staged or working orders to cancel.`,
    };
  }

  return {
    ok: true,
    reply:
      `Canceled / rejected **${canceled}** order(s)${symbol ? ` for **${symbol}**` : ""}.\n\n` +
      lines.join("\n") +
      `\n\n· Venue policy: ${venue.note}`,
  };
}

/** Stage STP SELL at avg entry (breakeven) for an open long. */
export async function stageStopToBreakeven(
  userId: string,
  text: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const symbol = await resolveManageSymbol(userId, text, opts?.conversationId);
  if (!symbol) {
    return { ok: false, reply: `Which position? e.g. "Move my AAPL stop to breakeven".` };
  }
  const open = (await listPositions(userId, 100)).find(
    (p) => p.status === "OPEN" && p.symbol.toUpperCase() === symbol && p.quantity > 0,
  );
  if (!open) {
    return { ok: false, reply: `No open **${symbol}** position. Nothing was staged.` };
  }
  const entry = Number(open.avgEntry);
  if (!(entry > 0)) {
    return { ok: false, reply: `**${symbol}** has no usable average entry for breakeven. Nothing was staged.` };
  }
  const staged = await stageExplicitIntelligenceOrder({
    userId,
    symbol,
    side: "SELL",
    quantity: open.quantity,
    lastPrice: entry,
    conversationId: opts?.conversationId,
    stop: entry,
    orderType: "STP",
    strategy: "INTELLIGENCE_NL",
  });
  if (!staged.ok) return staged;
  return {
    ok: true,
    reply:
      staged.reply +
      `\n\n_Stop-to-breakeven: STP SELL ${open.quantity} ${symbol} @ $${entry.toFixed(2)} (avg entry)._`,
  };
}

/** Stage LMT SELL for take-profit (optional half/quarter fraction). */
export async function stageTakeProfitOrder(
  userId: string,
  text: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const tpPct = parseTakeProfitPct(text);
  if (tpPct == null) {
    return {
      ok: false,
      reply: `I need a take-profit percent — e.g. "Take profit on half at 8%" or "Take profit at 5%".`,
    };
  }
  const symbol = await resolveManageSymbol(userId, text, opts?.conversationId);
  if (!symbol) {
    return { ok: false, reply: `Which symbol? e.g. "Take profit on half my AAPL at 8%".` };
  }
  const open = (await listPositions(userId, 100)).find(
    (p) => p.status === "OPEN" && p.symbol.toUpperCase() === symbol && p.quantity > 0,
  );
  if (!open) {
    return { ok: false, reply: `No open **${symbol}** position. Nothing was staged.` };
  }
  const entry = Number(open.avgEntry);
  if (!(entry > 0)) {
    return { ok: false, reply: `**${symbol}** has no usable entry for take-profit. Nothing was staged.` };
  }
  const frac = parsePositionFraction(text) ?? 1;
  const qty = Math.max(1, Math.min(open.quantity, Math.floor(open.quantity * frac)));
  const limit = +(entry * (1 + tpPct / 100)).toFixed(2);
  const staged = await stageExplicitIntelligenceOrder({
    userId,
    symbol,
    side: "SELL",
    quantity: qty,
    lastPrice: entry,
    conversationId: opts?.conversationId,
    limitPrice: limit,
    orderType: "LMT",
    stop: stopFromPct("SELL", limit, 1),
    strategy: "INTELLIGENCE_NL",
  });
  if (!staged.ok) return staged;
  return {
    ok: true,
    reply:
      staged.reply +
      `\n\n_Take-profit: LMT SELL ${qty} ${symbol} @ $${limit} (+${tpPct}% from entry $${entry.toFixed(2)})._`,
  };
}

/** Stage STP SELL protective stop at % below entry for open long. */
export async function stageProtectiveStopForPosition(
  userId: string,
  text: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const stopPct = parseStopLossPct(text);
  if (stopPct == null) {
    return { ok: false, reply: `I need a stop percent — e.g. "Add a 3% stop" or "Add a 3% stop on AAPL".` };
  }
  const symbol = await resolveManageSymbol(userId, text, opts?.conversationId);
  if (!symbol) {
    return { ok: false, reply: `Which position should get the stop? Name the ticker.` };
  }
  const open = (await listPositions(userId, 100)).find(
    (p) => p.status === "OPEN" && p.symbol.toUpperCase() === symbol && p.quantity > 0,
  );
  if (!open) {
    return { ok: false, reply: `No open **${symbol}** position. Nothing was staged.` };
  }
  const entry = Number(open.avgEntry);
  if (!(entry > 0)) {
    return { ok: false, reply: `**${symbol}** has no usable entry. Nothing was staged.` };
  }
  const stop = stopFromPct("BUY", entry, stopPct);
  const staged = await stageExplicitIntelligenceOrder({
    userId,
    symbol,
    side: "SELL",
    quantity: open.quantity,
    lastPrice: entry,
    conversationId: opts?.conversationId,
    stop,
    orderType: "STP",
    strategy: "INTELLIGENCE_NL",
  });
  if (!staged.ok) return staged;
  return {
    ok: true,
    reply:
      staged.reply +
      `\n\n_Protective stop: STP SELL ${open.quantity} ${symbol} @ $${stop} (−${stopPct}% from entry)._`,
  };
}

/** Replace flat stop idea with native TRAIL for an open long (or % from text). */
export async function stageTrailingStopForPosition(
  userId: string,
  text: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const trailPct = parseTrailPct(text) ?? 3;
  const symbol = await resolveManageSymbol(userId, text, opts?.conversationId);
  if (!symbol) {
    return { ok: false, reply: `Which position? e.g. "Make AAPL a trailing stop" or "Trail NVDA by 3%".` };
  }
  const open = (await listPositions(userId, 100)).find(
    (p) => p.status === "OPEN" && p.symbol.toUpperCase() === symbol && p.quantity > 0,
  );
  if (!open) {
    return { ok: false, reply: `No open **${symbol}** position to trail. Nothing was staged.` };
  }
  const entry = Number(open.avgEntry);
  const snap = await getSnapshot(userId, symbol).catch(() => null);
  const last = snap?.market_data_available && snap.price > 0 ? snap.price : entry;
  if (!(last > 0)) {
    return { ok: false, reply: `No price for **${symbol}** to size the trail. Nothing was staged.` };
  }
  const trailAmount = +(last * (trailPct / 100)).toFixed(2);
  const staged = await stageExplicitIntelligenceOrder({
    userId,
    symbol,
    side: "SELL",
    quantity: open.quantity,
    lastPrice: last,
    conversationId: opts?.conversationId,
    orderType: "TRAIL",
    trailAmount,
    strategy: "INTELLIGENCE_NL",
  });
  if (!staged.ok) return staged;
  return {
    ok: true,
    reply:
      staged.reply +
      `\n\n_Native IBKR TRAIL: SELL ${open.quantity} ${symbol} · trail $${trailAmount} (${trailPct}% of ~$${last.toFixed(2)})._`,
  };
}

/** Stage SELL for every open long that is currently profitable (mark > entry). */
export async function stageSellAllProfitable(
  userId: string,
  opts?: { conversationId?: string },
): Promise<{ ok: boolean; reply: string }> {
  const open = (await listPositions(userId, 100)).filter((p) => p.status === "OPEN" && p.quantity > 0);
  if (open.length === 0) {
    return { ok: false, reply: `No open positions. Nothing was staged.` };
  }

  const winners: Array<{ symbol: string; quantity: number; entry: number; mark: number; pnl: number }> = [];
  for (const p of open) {
    const entry = Number(p.avgEntry);
    let mark = p.mark;
    let pnl = p.unrealizedPnl;
    if (mark == null || pnl == null) {
      const snap = await getSnapshot(userId, p.symbol).catch(() => null);
      if (snap?.market_data_available && snap.price > 0) {
        mark = snap.price;
        pnl = +((mark - entry) * p.quantity).toFixed(2);
      }
    }
    if (mark != null && pnl != null && pnl > 0 && entry > 0) {
      winners.push({ symbol: p.symbol, quantity: p.quantity, entry, mark, pnl });
    }
  }

  if (winners.length === 0) {
    return { ok: false, reply: `No profitable open positions right now. Nothing was staged.` };
  }

  const lines: string[] = [];
  const failures: string[] = [];
  let okCount = 0;
  for (const w of winners) {
    const staged = await stageExplicitIntelligenceOrder({
      userId,
      symbol: w.symbol,
      side: "SELL",
      quantity: w.quantity,
      lastPrice: w.mark,
      conversationId: opts?.conversationId,
      orderType: "LMT",
      limitPrice: w.mark,
      stop: stopFromPct("SELL", w.mark, 1),
      strategy: "INTELLIGENCE_NL",
    });
    if (staged.ok) {
      okCount += 1;
      lines.push(
        `· **SELL ${w.quantity} ${w.symbol}** @ ~$${w.mark.toFixed(2)} (uPnL ~$${w.pnl}) → \`CONFIRM ORDER ${staged.ticketId}\``,
      );
    } else {
      failures.push(`${w.symbol}: ${staged.reply.split("\n")[0]}`);
    }
  }

  if (okCount === 0) {
    return {
      ok: false,
      reply: `Could not stage sell-profitable tickets.\n\n${failures.map((f) => `· ${f}`).join("\n")}`,
    };
  }

  return {
    ok: true,
    reply:
      `Staged **${okCount}** SELL ticket(s) for profitable holdings.\n\n` +
      lines.join("\n") +
      `\n\nConfirm each with \`CONFIRM ORDER …\`.` +
      (failures.length ? `\n\nSkipped:\n${failures.map((f) => `· ${f}`).join("\n")}` : ""),
  };
}
