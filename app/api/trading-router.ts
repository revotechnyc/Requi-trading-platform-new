import { z } from "zod";
import { createRouter, authedQuery, publicQuery, adminQuery } from "./middleware";
import { findStrategiesByUser, createStrategy, setStrategyStatus, findAccountsByUser } from "./queries/trading";
import { listMarketplace, getMarketplaceItem, myLibrary } from "./queries/marketplace";
import { ComplianceFlags } from "./lib/compliance-flags";
import { flagEnabled } from "./platform/feature-flags";
import { withIdempotency } from "./platform/idempotency";
import { TRPCError } from "@trpc/server";
import { findTicketsByUser, findAllTickets, createTicket, setTicketStatus } from "./queries/support";
import { getDb } from "./queries/connection";
import { brokerAccounts, users } from "@db/schema";
import { desc } from "drizzle-orm";
import { env } from "./lib/env";
import { isIbkrAccountConfigured } from "./brokers/ibkr";
import {
  completeRobinhoodConnect,
  disconnectRobinhood,
  getRobinhoodConnectionPublic,
  refreshRobinhoodHealth,
  startRobinhoodConnect,
} from "./brokers/robinhood-mcp/store";

function requestOrigin(req: Request): string {
  if (env.publicAppUrl) return env.publicAppUrl;
  const url = new URL(req.url);
  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const host = (xfHost ?? url.host).split(",")[0]!.trim();
  let proto = ((xfProto ?? url.protocol.replace(":", "")) || "https").split(",")[0]!.trim();
  const isLoopback =
    /^localhost(?::\d+)?$/i.test(host) ||
    /^127\.0\.0\.1(?::\d+)?$/.test(host) ||
    /^\[::1\](?::\d+)?$/.test(host);
  if (!isLoopback && proto === "http") proto = "https";
  return `${proto}://${host}`;
}

export const tradingRouter = createRouter({
  strategies: authedQuery.query(({ ctx }) => findStrategiesByUser(ctx.user.id)),

  createStrategy: authedQuery
    .input(z.object({ name: z.string().min(1).max(255), prompt: z.string().min(10) }))
    .mutation(({ ctx, input }) =>
      createStrategy({ userId: ctx.user.id, name: input.name, prompt: input.prompt }),
    ),

  setStrategyStatus: authedQuery
    .input(z.object({ id: z.string(), status: z.enum(["Live", "Paper", "Paused"]) }))
    .mutation(({ ctx, input }) => setStrategyStatus(ctx.user.id, input.id, input.status)),

  accounts: authedQuery.query(async ({ ctx }) => {
    const rows = await findAccountsByUser(ctx.user.id);
    const rh = await getRobinhoodConnectionPublic(ctx.user.id).catch(() => null);
    return {
      accounts: rows,
      robinhoodMcp: rh,
      ibkrServerLinked: isIbkrAccountConfigured(),
      ibkrAccountId: process.env.IBKR_ACCOUNT?.trim() || null,
    };
  }),

  /**
   * Connect a paper brokerage account — a real broker_accounts row backed by
   * the paper adapter, so the whole pipeline (autonomous config, allocation,
   * execution lineage) works end-to-end without external credentials. Live
   * broker connections arrive via their OAuth adapters; this is the safe
   * default. Equity starts at $100k of paper buying power.
   */
  connectPaperAccount: authedQuery
    .input(z.object({ label: z.string().min(1).max(100).default("Paper Account") }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .insert(brokerAccounts)
        .values({
          userId: ctx.user.id,
          organizationId: ctx.user.activeOrganizationId ?? null,
          broker: "Paper",
          label: input.label,
          type: "Paper",
          equity: "100000",
          status: "Connected",
        })
        .returning();
      return row;
    }),

  robinhoodMcpStart: authedQuery.mutation(async ({ ctx }) => {
    try {
      return await startRobinhoodConnect({
        userId: ctx.user.id,
        origin: requestOrigin(ctx.req),
      });
    } catch (e) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: e instanceof Error ? e.message : "Failed to start Robinhood MCP connect",
      });
    }
  }),

  robinhoodMcpComplete: publicQuery
    .input(z.object({ code: z.string().min(1), state: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        return await completeRobinhoodConnect({
          code: input.code,
          state: input.state,
        });
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "Robinhood MCP connect failed",
        });
      }
    }),

  robinhoodMcpDisconnect: authedQuery.mutation(async ({ ctx }) => {
    return disconnectRobinhood(ctx.user.id);
  }),

  robinhoodMcpRefresh: authedQuery.mutation(async ({ ctx }) => {
    try {
      return await refreshRobinhoodHealth(ctx.user.id);
    } catch (e) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: e instanceof Error ? e.message : "Robinhood MCP health refresh failed",
      });
    }
  }),
});

export const marketplaceRouter = createRouter({
  /** Public catalog — preview metadata only; full paid content never leaves this router unpurchased. */
  list: publicQuery.query(() => listMarketplace()),

  detail: publicQuery
    .input(z.object({ slug: z.string().min(1).max(255) }))
    .query(({ ctx, input }) => getMarketplaceItem(input.slug, ctx.user?.id)),

  /** Purchased strategies — the only surface that returns full strategy content. */
  myLibrary: authedQuery.query(({ ctx }) => myLibrary(ctx.user.id)),

  /**
   * Purchase intent. Gated server-side by the marketplace legal flag (Legal
   * Revision LB-2) and by payment-rail availability — Stripe is not connected,
   * so no real charge can be made. Never fabricate a sale.
   */
  purchase: authedQuery
    .input(z.object({ slug: z.string().min(1).max(255), idempotencyKey: z.string().min(8).max(128).optional() }))
    .mutation(async ({ input, ctx }) => {
      // Server-side legal gate (Legal Revision LB-2) + runtime feature flag.
      const flagOpen = await flagEnabled("marketplace_checkout", {
        userId: ctx.user.id,
        organizationId: ctx.user.activeOrganizationId,
      });
      if (!ComplianceFlags.strategyMarketplaceLegalApproved || !flagOpen) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "MARKETPLACE_NOT_OPEN — strategy purchases are pending final legal review and payment integration. No charge was made and no entitlement was created.",
        });
      }
      return withIdempotency("marketplace.purchase", input.idempotencyKey, ctx.user.id, async () => {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "PAYMENTS_NOT_CONNECTED — Stripe checkout is not configured. No charge was made.",
        });
      });
    }),
});

export const supportRouter = createRouter({
  // customer's own tickets
  list: authedQuery.query(({ ctx }) => findTicketsByUser(ctx.user.id)),

  create: authedQuery
    .input(
      z.object({
        subject: z.string().min(3).max(500),
        description: z.string().max(5000).optional(),
        category: z.enum(["Billing", "Execution", "Connections", "Strategies", "Account"]),
        priority: z.enum(["Urgent", "High", "Normal", "Low"]),
      }),
    )
    .mutation(({ ctx, input }) =>
      createTicket({
        userId: ctx.user.id,
        userName: ctx.user.name ?? "Unknown",
        userEmail: ctx.user.email ?? "",
        ...input,
      }),
    ),
});

/** SaaS-owner endpoints (admin role required). */
export const adminRouter = createRouter({
  users: adminQuery.query(() =>
    getDb().query.users.findMany({ orderBy: [desc(users.createdAt)] }),
  ),

  tickets: adminQuery.query(() => findAllTickets()),

  createTicket: adminQuery
    .input(
      z.object({
        userName: z.string().min(1).max(255),
        userEmail: z.string().email().max(320),
        subject: z.string().min(3).max(500),
        description: z.string().max(5000).optional(),
        category: z.enum(["Billing", "Execution", "Connections", "Strategies", "Account"]),
        priority: z.enum(["Urgent", "High", "Normal", "Low"]),
      }),
    )
    .mutation(({ input }) => createTicket(input)),

  setTicketStatus: adminQuery
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["Open", "In progress", "Waiting on user", "Resolved"]),
      }),
    )
    .mutation(({ input }) => setTicketStatus(input.id, input.status)),

  stats: adminQuery.query(async () => {
    const all = await getDb().query.users.findMany();
    const tickets = await findAllTickets();
    return {
      totalUsers: all.length,
      openTickets: tickets.filter((t) => t.status === "Open").length,
      inProgress: tickets.filter((t) => t.status === "In progress").length,
      resolved: tickets.filter((t) => t.status === "Resolved").length,
    };
  }),
});
