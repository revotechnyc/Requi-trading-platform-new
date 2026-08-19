import { createRouter, authedQuery } from "./middleware";
import { countSignalsToday, listSignals, listSignalsToday } from "./queries/signals";

/**
 * SIGNALS API (Production Revision §10) — serves the canonical signal ledger.
 * Nothing here is synthesized for display: every row was written by the
 * ticket service when a real signal was generated, and "today" follows the
 * user's trading session (ET calendar day).
 */
export const signalsRouter = createRouter({
  /** Today's signals (ET session day), newest first. */
  today: authedQuery.query(({ ctx }) => listSignalsToday(ctx.user.id)),

  /** Recent signal history (durable — survives reloads and deployments). */
  list: authedQuery.query(({ ctx }) => listSignals(ctx.user.id, 100)),

  /** Count for badges/chrome — real ledger count, never a placeholder. */
  todayCount: authedQuery.query(async ({ ctx }) => ({ count: await countSignalsToday(ctx.user.id) })),
});
