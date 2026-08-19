import { z } from "zod";
import { authedQuery, createRouter } from "./middleware";
import { brokerStatuses, resolveBroker, type BrokerCode } from "./brokers/registry";
import { cancelTicket, confirmTicket, listTickets, proposeTicket, rejectTicket } from "./queries/tickets";

/**
 * EXECUTION API — full trading capabilities through the confirmation gate.
 *
 * Every trade follows the same constitutional path regardless of origin
 * (Intelligence chat, Autonomous loop, or direct API):
 *
 *   propose → READY_FOR_CONFIRMATION → exact CONFIRM ORDER [TICKET_ID]
 *   → validated by the signed governance package → broker submission
 *   → ACK/fill tracking → alerts at every transition.
 *
 * Nothing here ever routes an order without explicit per-ticket confirmation.
 */

const proposeInput = z.object({
  strategy: z.string().min(1).max(64).default("MANUAL"),
  broker: z.enum(["PAPER", "ROBINHOOD_MCP", "IBKR"]).default("PAPER"),
  accountId: z.string().max(64).optional(),
  symbol: z.string().min(1).max(16),
  side: z.enum(["BUY", "SELL"]),
  quantity: z.number().int().positive().max(100000),
  orderType: z.enum(["MKT", "LMT", "STP", "STP_LMT", "TRAIL"]).default("LMT"),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  tif: z.enum(["DAY", "GTC", "IOC", "OPG", "CLS"]).default("DAY"),
  entry: z.number().positive().optional(),
  stop: z.number().positive().optional(),
  target: z.number().positive().optional(),
  origin: z.enum(["INTELLIGENCE", "AUTONOMOUS", "MANUAL"]).default("MANUAL"),
});

export const executionRouter = createRouter({
  /** Broker connection status, capabilities, and configuration guidance. */
  brokers: authedQuery.query(async () => brokerStatuses()),

  /** Stage a trade for confirmation. Returns the ticket + the exact response string. */
  propose: authedQuery.input(proposeInput).mutation(async ({ ctx, input }) => {
    const { ticket, duplicate, degradedNote } = await proposeTicket(ctx.user!.id, input as Parameters<typeof proposeTicket>[1] & { broker: BrokerCode });
    return {
      ticket,
      duplicate,
      degradedNote,
      respondWith: [`CONFIRM ORDER ${ticket.ticketId}`, `REJECT ORDER ${ticket.ticketId}`],
      disclosure: "Staged only. Nothing reaches a broker until you confirm this exact ticket.",
    };
  }),

  /** CONFIRM ORDER [TICKET_ID] — exact-string gated submission. */
  confirm: authedQuery
    .input(z.object({ ticketId: z.string().min(4).max(40), confirmation: z.string().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => confirmTicket(ctx.user!.id, input.ticketId, input.confirmation)),

  /** REJECT ORDER [TICKET_ID]. */
  reject: authedQuery.input(z.object({ ticketId: z.string().min(4).max(40) })).mutation(async ({ ctx, input }) => rejectTicket(ctx.user!.id, input.ticketId)),

  /** Cancel a working broker order. */
  cancel: authedQuery.input(z.object({ ticketId: z.string().min(4).max(40) })).mutation(async ({ ctx, input }) => cancelTicket(ctx.user!.id, input.ticketId)),

  /** Ticket history (minimum-disclosure fields). */
  tickets: authedQuery.query(async ({ ctx }) => listTickets(ctx.user!.id)),

  /** Live positions from the selected broker (paper by default). */
  positions: authedQuery.input(z.object({ broker: z.enum(["PAPER", "ROBINHOOD_MCP", "IBKR"]).default("PAPER") })).query(async ({ input }) => {
    const { adapter, effective, degraded, note } = resolveBroker(input.broker);
    const accounts = await adapter.getAccounts();
    const accountId = accounts[0]?.accountId ?? "PAPER-001";
    const positions = await adapter.getPositions(accountId);
    return { effectiveBroker: effective, degraded, note, accountId, positions };
  }),
});
