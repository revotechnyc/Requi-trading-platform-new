import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { getPnlSummary, listOrders, listPositions, type OrderHistoryRow } from "./engine/portfolio";

/**
 * FINANCIALS API (Production Revision §12–§16) — the canonical reporting
 * surface. P&L, positions and order history come from the same backend
 * functions Autonomous and Intelligence consume; nothing is recalculated
 * for display. CSV export runs through the same authorized query path and
 * is sanitized against spreadsheet formula injection.
 */

const orderFilter = z.object({
  symbol: z.string().max(12).optional(),
  status: z.string().max(32).optional(),
  search: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(500).default(200),
});

function applyFilters(rows: OrderHistoryRow[], f: { symbol?: string; status?: string; search?: string }): OrderHistoryRow[] {
  return rows.filter((r) => {
    if (f.symbol && !r.symbol.toUpperCase().includes(f.symbol.toUpperCase())) return false;
    if (f.status && r.state !== f.status) return false;
    if (f.search) {
      const q = f.search.toUpperCase();
      if (!r.ticketId.toUpperCase().includes(q) && !r.symbol.toUpperCase().includes(q) && !r.strategy.toUpperCase().includes(q)) return false;
    }
    return true;
  });
}

/** CSV cell guard: neutralize spreadsheet formula injection (= + - @ and control chars). */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CSV_HEADER = [
  "order_id", "account", "broker", "symbol", "side", "order_type", "quantity", "filled_quantity",
  "limit_price", "stop_price", "average_fill_price", "status", "strategy", "strategy_version",
  "created_at", "submitted_at", "filled_at", "commission", "fees", "realized_pnl",
];

function toCsv(rows: OrderHistoryRow[]): string {
  const lines = rows.map((r) =>
    [
      r.ticketId, r.accountId, r.broker, r.symbol, r.side, r.orderType, r.quantity, r.filledQuantity,
      r.limitPrice, r.stopPrice, r.averageFillPrice, r.state, r.strategy, "", // strategy_version: see gap G-31
      r.createdAt, r.submittedAt, "", // filled_at not separately tracked on the ticket — never fabricated
      "", "", "", // commission/fees/per-order realized P&L not reported by the paper adapter — empty, not zero
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\n");
}

export const financialsRouter = createRouter({
  /** Portfolio P&L summary (realized / unrealized / open / byMode split). */
  summary: authedQuery.query(({ ctx }) => getPnlSummary(ctx.user.id)),

  /** Positions with live marks when the feed has them. */
  positions: authedQuery.query(({ ctx }) => listPositions(ctx.user.id, 200)),

  /** Canonical order history with server-side filters (§14). */
  orders: authedQuery.input(orderFilter).query(async ({ ctx, input }) => {
    const rows = await listOrders(ctx.user.id, input.limit);
    return applyFilters(rows, input);
  }),

  /**
   * CSV export of the user's own filtered order history (§15).
   * Server-side authorized (authedQuery — the caller can only ever receive
   * their own rows), injection-sanitized, and assembled from the canonical
   * ledger. Empty columns are empty: unreported fees are never shown as 0.
   */
  ordersCsv: authedQuery.input(orderFilter).query(async ({ ctx, input }) => {
    const rows = await listOrders(ctx.user.id, input.limit);
    return { filename: `requi-order-history-${new Date().toISOString().slice(0, 10)}.csv`, csv: toCsv(applyFilters(rows, input)) };
  }),
});
