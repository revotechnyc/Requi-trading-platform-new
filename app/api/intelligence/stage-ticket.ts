/**
 * Deterministic Intelligence staging — advisory → proposeTicket.
 * Does not call the LLM; venue comes from resolveIntelligenceBroker.
 */
import { proposeTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";
import { clearThreadState, setThreadState, type Advisory } from "./intent";

export type StageFromAdvisoryResult =
  | { ok: true; reply: string; ticketId: string }
  | { ok: false; reply: string };

/**
 * Stage a ticket from a fresh advisory. Blocks UNFAVORABLE / BLOCKED so the
 * new setup does not silently open tickets against a failed protocol check.
 * FAVORABLE / WAIT may stage (WAIT still needs human CONFIRM).
 */
export async function stageTicketFromAdvisory(
  userId: string,
  advisory: Advisory,
  opts?: { quantity?: number },
): Promise<StageFromAdvisoryResult> {
  if (advisory.verdict === "UNFAVORABLE" || advisory.verdict === "BLOCKED") {
    return {
      ok: false,
      reply:
        `I won't stage **${advisory.symbol}** — advisory is **${advisory.verdict}**.\n\n` +
        advisory.reasons.map((r) => `· ${r}`).join("\n") +
        (advisory.watchFor ? `\n\nWatch for: ${advisory.watchFor}` : "") +
        `\n\nNothing was staged. Fix the blockers (data / governance / setup), run a fresh \`buy ${advisory.symbol}\`, then say **"stage it"** again.`,
    };
  }

  const last = advisory.proposed?.lastPrice ?? undefined;
  const qty =
    opts?.quantity ??
    advisory.sizingPreview?.qty ??
    (last != null && last > 0 ? Math.max(1, Math.floor(2500 / last)) : 10);
  const stop =
    last != null && last > 0
      ? +(last * (advisory.side === "BUY" ? 0.99 : 1.01)).toFixed(2)
      : undefined;

  try {
    const { broker, accountId, note } = await resolveIntelligenceBroker(userId);
    const res = await proposeTicket(userId, {
      strategy: advisory.setup?.strategyId ?? "MANUAL",
      broker,
      accountId,
      symbol: advisory.symbol,
      side: advisory.side,
      quantity: Math.max(1, qty),
      orderType: last != null ? "LMT" : "MKT",
      limitPrice: last,
      stop,
      entry: last,
      origin: "INTELLIGENCE",
    });
    const t = res.ticket;
    clearThreadState(userId);
    setThreadState(userId, {
      stagedTicketId: t.ticketId,
      stagedExpiresAt: Date.now() + 5 * 60_000,
    });

    return {
      ok: true,
      ticketId: t.ticketId,
      reply:
        `Staged — ticket **${t.ticketId}**. Reply exactly **CONFIRM ORDER ${t.ticketId}** to authorize, or **REJECT ORDER ${t.ticketId}** to cancel.\n\n` +
        `· ${t.symbol} ${t.side} ${t.quantity} @ ${t.orderType}${t.limitPrice != null ? ` ${t.limitPrice}` : ""}\n` +
        `· Venue: ${t.effectiveBroker ?? t.broker}${res.degradedNote ? ` (${res.degradedNote})` : ""}\n` +
        `· Policy: ${note}\n` +
        `· Nothing reaches a broker until you confirm.`,
    };
  } catch (e) {
    return {
      ok: false,
      reply: `I couldn't stage that ticket: ${(e as Error).message}. The advisory still stands — say "stage it" again after fixing the error, or place from Tickets.`,
    };
  }
}
