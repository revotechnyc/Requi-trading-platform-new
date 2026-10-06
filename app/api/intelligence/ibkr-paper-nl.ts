/**
 * Intelligence → IBKR Paper natural-language helpers (additive).
 * Does not alter research/CHAT routing. Staging still requires CONFIRM ORDER.
 */
import { proposeTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";
import { listPositions } from "../engine/portfolio";
import { ibkrPaperStatus } from "../brokers/ibkr-paper";
import { assertIbkrPaperUnlessLiveUnlocked, isIbkrPaperAccountId } from "../brokers/ibkr";
import { clearThreadState, setThreadState } from "./intent";
import type { BrokerCode } from "../brokers/registry";

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
  /** Prefer MKT when user said "market" */
  orderType?: "MKT" | "LMT" | "TRAIL";
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
    text.match(/\b(\d+(?:\.\d+)?)\s*%\s*trail(?:ing)?\s*stop\b/i);
  if (!m) return null;
  const pct = Number.parseFloat(m[1]);
  if (!Number.isFinite(pct) || pct <= 0 || pct > 50) return null;
  return pct;
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
    stopFromPct(input.side, input.lastPrice, 1);

  try {
    const res = await proposeTicket(input.userId, {
      strategy: input.strategy ?? "INTELLIGENCE_NL",
      broker,
      accountId,
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      quantity: Math.max(1, Math.floor(input.quantity)),
      orderType: orderType === "TRAIL" ? "TRAIL" : orderType,
      limitPrice: orderType === "MKT" || orderType === "TRAIL" ? undefined : limit,
      stop,
      stopPrice: orderType === "TRAIL" ? undefined : stop,
      entry: input.lastPrice,
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

    return {
      ok: true,
      ticketId: t.ticketId,
      reply:
        `Staged for **IBKR Paper** — ticket **${t.ticketId}**.\n\n` +
        `· ${t.symbol} ${t.side} ${t.quantity} @ ${t.orderType}` +
        `${t.limitPrice != null ? ` ${t.limitPrice}` : ""}` +
        `${stop != null ? ` · stop ${stop}` : ""}\n` +
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
  // Never steal close/sell/buy imperatives — those stage tickets.
  if (/\b(buy|sell|flatten|exit|close)\b/i.test(text) && !/\?/.test(text)) {
    return null;
  }
  const wantsAccount =
    /\b(buying\s*power|cash|balance|equity|nav|account)\b/i.test(text) ||
    /\b(positions?|portfolio|what'?s open|pnl|p&l|exposure)\b/i.test(text);
  if (!wantsAccount) return null;

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

  if (/\b(positions?|portfolio|what'?s open|exposure|pnl|p&l)\b/i.test(text)) {
    if (open.length === 0) {
      lines.push(`\nOpen positions: none in autonomous ledger.`);
    } else {
      lines.push(`\nOpen positions (${open.length}):`);
      for (const p of open.slice(0, 20)) {
        lines.push(
          `· ${p.symbol} ${p.quantity} @ ${p.avgEntry}` +
            (p.broker ? ` · ${p.broker}` : "") +
            (p.strategy ? ` · ${p.strategy}` : ""),
        );
      }
    }
  }

  lines.push(`\n_Read-only — saying "buy …" stages a ticket; CONFIRM ORDER is still required to trade._`);
  return lines.join("\n");
}
