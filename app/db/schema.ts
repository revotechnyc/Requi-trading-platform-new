import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  timestamp,
  integer,
  numeric,
  boolean,
  jsonb,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: varchar("role", { length: 24 }).default("user").notNull(),
  /** Governance RBAC level: USER | OPERATOR | RISK_COMPLIANCE | GOVERNANCE_ADMIN | DEVELOPER */
  govRole: varchar("govRole", { length: 32 }).notNull().default("USER"),
  /** When true, AUTONOMOUS-origin engine proposals execute without the CONFIRM string. Default off. */
  autoExecute: boolean("autoExecute").notNull().default(false),
  stopMode: varchar("stopMode", { length: 16 }).notNull().default("CLASSIC"), // CLASSIC (flat stop → 1R arm → ATR trail) | IMMEDIATE_TRAIL (0.5% trail from entry + moving hard bottom)
  /** When true, the auto-universe engine builds this user's watchlist and starts monitors automatically (Strategy Spec §3 stages 1–2). Default off. */
  autoUniverse: boolean("autoUniverse").notNull().default(false),
  /** Max concurrent auto-universe monitors per user. */
  autoUniverseMax: integer("autoUniverseMax").notNull().default(5),
  /** Account deactivation (Legal Revision §33) — deactivate ≠ delete ≠ retain. */
  deactivatedAt: timestamp("deactivatedAt", { withTimezone: true }),
  /** Platform RBAC (§9): NONE | SAAS_OWNER | PLATFORM_ADMIN | SYSTEM_OPS | SUPPORT | FINANCE_ADMIN | MARKETPLACE_ADMIN | AFFILIATE_ADMIN | COMPLIANCE_AUDIT */
  platformRole: varchar("platformRole", { length: 32 }).notNull().default("NONE"),
  /** Current/active organization context. */
  activeOrganizationId: text("activeOrganizationId"),
  /** Platform-admin suspension (distinct from user self-deactivation). */
  suspendedAt: timestamp("suspendedAt", { withTimezone: true }),
  suspendedReason: text("suspendedReason"),
  /** Multi-provider auth: which identity provider created/linked this account. */
  authProvider: varchar("authProvider", { length: 32 }).notNull().default("SUPABASE"),
  /** Provider-side user identifier (e.g. Google `sub`). Paired with authProvider. */
  providerUserId: varchar("providerUserId", { length: 255 }),
  /** Whether the provider has verified the account email. */
  emailVerified: boolean("emailVerified").notNull().default(false),
  /** Session revocation: session tokens issued before this instant are invalid (owner "revoke sessions" action). */
  sessionsRevokedAt: timestamp("sessionsRevokedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  lastSignInAt: timestamp("lastSignInAt", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Trading: text-based strategies ─────────────────────────────────────────

export const strategies = pgTable("strategies", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  teamId: text("teamId"),
  name: varchar("name", { length: 255 }).notNull(),
  source: varchar("source", { length: 24 }).notNull().default("Custom"),
  asset: varchar("asset", { length: 24 }).notNull().default("Stocks"),
  status: varchar("status", { length: 24 }).notNull().default("Paper"),
  prompt: text("prompt").notNull(), // text-based strategy definition
  parsedPlan: text("parsedPlan"), // JSON string of the parsed execution plan
  accounts: integer("accounts").notNull().default(0),
  pnl30d: numeric("pnl30d", { precision: 8, scale: 2 }).notNull().default("0"),
  winRate: integer("winRate").notNull().default(0),
  trades: integer("trades").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Strategy = typeof strategies.$inferSelect;

// ─── Broker accounts ─────────────────────────────────────────────────────────

export const brokerAccounts = pgTable("broker_accounts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  broker: varchar("broker", { length: 100 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 24 }).notNull().default("Paper"),
  equity: numeric("equity", { precision: 16, scale: 2 }).notNull().default("0"),
  dayPnl: numeric("dayPnl", { precision: 16, scale: 2 }).notNull().default("0"),
  status: varchar("status", { length: 24 }).notNull().default("Connected"),
  strategies: integer("strategies").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type BrokerAccount = typeof brokerAccounts.$inferSelect;

// ─── Marketplace ─────────────────────────────────────────────────────────────

export const marketplaceItems = pgTable("marketplace_items", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  author: varchar("author", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull(),
  asset: varchar("asset", { length: 50 }).notNull(),
  price: integer("price").notNull().default(29),
  category: varchar("category", { length: 100 }).notNull().default("Strategy"),
  description: text("description").notNull(),
  outcome: varchar("outcome", { length: 500 }).notNull().default(""),
  tags: text("tags").notNull(),
  prompt: text("prompt").notNull(),
  creatorId: text("creatorId"),
  version: integer("version").notNull().default(1),
  /** DRAFT | PENDING | APPROVED | REJECTED | SUSPENDED | REMOVED — only APPROVED is publicly listed. */
  status: varchar("status", { length: 16 }).notNull().default("APPROVED"),
  moderatedBy: text("moderatedBy"),
  moderatedAt: timestamp("moderatedAt", { withTimezone: true }),
  moderationNote: text("moderationNote"),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketplaceItem = typeof marketplaceItems.$inferSelect;

/** Purchased strategy entitlements — full paid content is served only through these. */
export const marketplaceEntitlements = pgTable("marketplace_entitlements", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  itemId: text("itemId").notNull(),
  organizationId: text("organizationId"),
  itemSlug: varchar("itemSlug", { length: 255 }).notNull(),
  pricePaid: integer("pricePaid").notNull(),
  method: varchar("method", { length: 50 }).notNull().default("PENDING"),
  grantedAt: timestamp("grantedAt", { withTimezone: true }).defaultNow().notNull(),
});

export type MarketplaceEntitlement = typeof marketplaceEntitlements.$inferSelect;

// ─── Support tickets ─────────────────────────────────────────────────────────

export const supportTickets = pgTable("support_tickets", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId"), // null = logged by owner on behalf of user
  organizationId: text("organizationId"),
  userName: varchar("userName", { length: 255 }).notNull(),
  userEmail: varchar("userEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 24 }).notNull().default("Account"),
  priority: varchar("priority", { length: 24 }).notNull().default("Normal"),
  status: varchar("status", { length: 24 }).notNull().default("Open"),
  assignedTo: text("assignedTo"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type SupportTicket = typeof supportTickets.$inferSelect;

// ─── Per-user AI limits / guardrails ─────────────────────────────────────────

export const aiLimits = pgTable("ai_limits", {
  userId: text("userId").primaryKey(),
  paperOnly: boolean("paperOnly").notNull().default(true),
  maxOrderNotional: numeric("maxOrderNotional", { precision: 14, scale: 2 }).notNull().default("5000"),
  dailyNotionalCap: numeric("dailyNotionalCap", { precision: 14, scale: 2 }).notNull().default("20000"),
  dailyTokenCap: integer("dailyTokenCap").notNull().default(200000),
  killSwitch: boolean("killSwitch").notNull().default(false),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type AiLimits = typeof aiLimits.$inferSelect;

// ─── User notifications & alerts ─────────────────────────────────────────────

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId")
    .notNull()
    .references(() => users.id),
  type: varchar("type", { length: 24 }).notNull(),
  priority: varchar("priority", { length: 24 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  symbol: varchar("symbol", { length: 32 }),
  state: varchar("state", { length: 48 }),
  read: boolean("read").notNull().default(false),
  /** Idempotency key — set for system-generated alerts (e.g. the domain eventId); null for ad-hoc alerts. */
  dedupeKey: varchar("dedupeKey", { length: 96 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type Alert = typeof alerts.$inferSelect;

// ─── Autonomous run sessions & live event stream ─────────────────────────────

export const runSessions = pgTable("run_sessions", {
  userId: text("userId")
    .primaryKey()
    .references(() => users.id),
  organizationId: text("organizationId"),
  correlationId: varchar("correlationId", { length: 64 }),
  active: boolean("active").notNull().default(false),
  mode: varchar("mode", { length: 32 }).notNull().default("AUTONOMOUS_PAPER"),
  startedAt: timestamp("startedAt", { withTimezone: true }).defaultNow().notNull(),
  lastEventAt: timestamp("lastEventAt", { withTimezone: true }).defaultNow().notNull(),
  arc: varchar("arc", { length: 24 }).notNull().default("idle"),
  symbol: varchar("symbol", { length: 16 }),
  entry: numeric("entry", { precision: 12, scale: 2 }),
  stop: numeric("stop", { precision: 12, scale: 2 }),
  target: numeric("target", { precision: 12, scale: 2 }),
  ticketId: varchar("ticketId", { length: 24 }),
  ticks: integer("ticks").notNull().default(0),
});

export const runEvents = pgTable("run_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId")
    .notNull()
    .references(() => users.id),
  phase: varchar("phase", { length: 20 }).notNull(),
  kind: varchar("kind", { length: 24 }).notNull().default("info"),
  message: text("message").notNull(),
  symbol: varchar("symbol", { length: 16 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type RunEvent = typeof runEvents.$inferSelect;
export type RunSession = typeof runSessions.$inferSelect;

// ─── Private Governance Compiler (server-side only; never sent to clients) ───

export const governanceDocuments = pgTable("governance_documents", {
  docKey: varchar("docKey", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  version: varchar("version", { length: 32 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("REGISTERED"),
  registeredAt: timestamp("registeredAt", { withTimezone: true }).defaultNow().notNull(),
});

export const governancePackages = pgTable("governance_packages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  version: varchar("version", { length: 32 }).notNull(),
  hash: varchar("hash", { length: 64 }).notNull(), // immutable artifact hash
  signature: varchar("signature", { length: 64 }).notNull(), // HMAC over hash
  status: varchar("status", { length: 24 }).notNull().default("STAGED"),
  artifact: text("artifact").notNull(), // compiled policy packages A–F (JSON, private)
  report: text("report").notNull(), // compilation report: stages, traces, unresolved (JSON, private)
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  activatedAt: timestamp("activatedAt", { withTimezone: true }),
});

export type GovernanceDocument = typeof governanceDocuments.$inferSelect;
export type GovernancePackage = typeof governancePackages.$inferSelect;

// ─── Order tickets — the only artifact that may reach a broker ───
// Lifecycle: CREATED → READY_FOR_CONFIRMATION → CONFIRMED → SUBMITTING →
// BROKER_ACK → WORKING → PARTIALLY_FILLED → FILLED → PROTECTED
// Terminal alt states: REJECTED | EXPIRED | CANCELED | FAILED

export const orderTickets = pgTable("order_tickets", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticketId", { length: 40 }).notNull().unique(), // [STRATEGY]-[YYYYMMDD]-[SEQ]
  userId: text("userId").notNull().references(() => users.id),
  organizationId: text("organizationId"),
  runSessionId: text("runSessionId"),
  correlationId: varchar("correlationId", { length: 64 }),
  strategy: varchar("strategy", { length: 64 }).notNull(),
  broker: varchar("broker", { length: 24 }).notNull().default("PAPER"),
  effectiveBroker: varchar("effectiveBroker", { length: 24 }),
  accountId: varchar("accountId", { length: 64 }),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  side: varchar("side", { length: 24 }).notNull(),
  quantity: integer("quantity").notNull(),
  orderType: varchar("orderType", { length: 24 }).notNull().default("LMT"),
  limitPrice: numeric("limitPrice", { precision: 12, scale: 2 }),
  stopPrice: numeric("stopPrice", { precision: 12, scale: 2 }),
  tif: varchar("tif", { length: 8 }).notNull().default("DAY"),
  state: varchar("state", { length: 32 }).notNull().default("CREATED"),
  entry: numeric("entry", { precision: 12, scale: 2 }),
  stop: numeric("stop", { precision: 12, scale: 2 }),
  target: numeric("target", { precision: 12, scale: 2 }),
  target2: numeric("target2", { precision: 12, scale: 2 }), // second scale-out target (engine proposals)
  maxLoss: numeric("maxLoss", { precision: 12, scale: 2 }),
  rr: numeric("rr", { precision: 6, scale: 2 }),
  /** True when executed via the auto-execute path (no CONFIRM string) — audit marker. */
  autoExecuted: boolean("autoExecuted").notNull().default(false),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull(),
  brokerOrderId: varchar("brokerOrderId", { length: 64 }),
  filledQuantity: integer("filledQuantity"),
  averageFillPrice: numeric("averageFillPrice", { precision: 12, scale: 2 }),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true }),
  submittedAt: timestamp("submittedAt", { withTimezone: true }),
  lastMessage: varchar("lastMessage", { length: 500 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type OrderTicket = typeof orderTickets.$inferSelect;

/* ---------- Intelligence: conversation memory ---------- */

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  /** Groups messages into a resumable conversation (Recent Conversations). */
  conversationId: text("conversationId"),
  role: varchar("role", { length: 16 }).notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type ChatMessageRow = typeof chatMessages.$inferSelect;

/* ---------- Intelligence: resumable conversations ---------- */

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  /** Auto-titled from the first user message; user-renameable. */
  title: varchar("title", { length: 255 }).notNull(),
  lastMessageAt: timestamp("lastMessageAt", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
});

/* ---------- Intelligence: scheduled tasks ---------- */

export const scheduledTasks = pgTable("scheduled_tasks", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  name: varchar("name", { length: 255 }).notNull(),
  /** The Intelligence prompt to run on schedule. */
  prompt: text("prompt").notNull(),
  /** DAILY | WEEKDAYS | WEEKLY | INTERVAL | MARKET_OPEN */
  scheduleType: varchar("scheduleType", { length: 16 }).notNull().default("DAILY"),
  /** HH:MM (24h) in `timezone` for time-of-day schedules. */
  timeOfDay: varchar("timeOfDay", { length: 5 }).notNull().default("09:30"),
  /** IANA timezone, e.g. America/New_York. */
  timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
  /** For WEEKLY: ISO weekday numbers [1..7]. */
  daysOfWeek: jsonb("daysOfWeek").notNull().default([]),
  /** For INTERVAL: minutes between runs (min 15). */
  intervalMinutes: integer("intervalMinutes"),
  enabled: boolean("enabled").notNull().default(true),
  nextRunAt: timestamp("nextRunAt", { withTimezone: true }),
  lastRunAt: timestamp("lastRunAt", { withTimezone: true }),
  lastRunStatus: varchar("lastRunStatus", { length: 16 }), // SUCCESS | ERROR
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
});

export const scheduledTaskRuns = pgTable("scheduled_task_runs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  taskId: text("taskId").notNull().references(() => scheduledTasks.id),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  status: varchar("status", { length: 16 }).notNull().default("RUNNING"), // RUNNING | SUCCESS | ERROR
  /** Scheduled runs open a fresh conversation so results are resumable. */
  conversationId: text("conversationId"),
  replyExcerpt: text("replyExcerpt"),
  error: text("error"),
  startedAt: timestamp("startedAt", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finishedAt", { withTimezone: true }),
});

/* ---------- Autonomous Trading control center (v2) ----------
   Three-table design: one config per user (setup + risk), sessions as the
   lifecycle record (start/pause/stop timestamps), and an append-only event
   stream powering the Live Run Stream. Orders/positions/P&L stay in the
   canonical order_tickets / positions tables (linked via runSessionId) —
   the database, never the browser, is the source of truth. */

export const autonomousConfigs = pgTable("autonomous_configs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull().unique(),
  organizationId: text("organizationId"),
  /** Selected brokerage account the bot trades through (null = not chosen). */
  accountId: text("accountId").references(() => brokerAccounts.id),
  /** PAPER | LIVE — switching to LIVE requires typed confirmation (liveConfirmedAt). */
  mode: varchar("mode", { length: 8 }).notNull().default("PAPER"),
  /** DOLLAR | PERCENT — how allocationValue is interpreted. */
  allocationType: varchar("allocationType", { length: 8 }).notNull().default("DOLLAR"),
  /** Dollar amount or percent of account equity authorized to the bot. */
  allocationValue: numeric("allocationValue", { precision: 16, scale: 2 }).notNull().default("0"),
  /* --- risk configuration (enforced server-side in the runner) --- */
  maxPositionSizePct: numeric("maxPositionSizePct", { precision: 5, scale: 2 }).notNull().default("10"),
  maxDailyLoss: numeric("maxDailyLoss", { precision: 14, scale: 2 }).notNull().default("1000"),
  maxPositions: integer("maxPositions").notNull().default(5),
  stopLossPct: numeric("stopLossPct", { precision: 5, scale: 2 }).notNull().default("2"),
  trailingStopPct: numeric("trailingStopPct", { precision: 5, scale: 2 }).notNull().default("1.5"),
  /** When the user typed the live-trading confirmation; null = never confirmed. */
  liveConfirmedAt: timestamp("liveConfirmedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type AutonomousConfig = typeof autonomousConfigs.$inferSelect;

export const autonomousSessions = pgTable("autonomous_sessions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  configId: text("configId").references(() => autonomousConfigs.id),
  /** Mode + account snapshots taken at start — config edits never rewrite history. */
  mode: varchar("mode", { length: 8 }).notNull().default("PAPER"),
  accountId: text("accountId"),
  /** RUNNING | PAUSED | STOPPED | ERROR | BROKER_DISCONNECTED */
  status: varchar("status", { length: 24 }).notNull().default("STOPPED"),
  startedAt: timestamp("startedAt", { withTimezone: true }).defaultNow().notNull(),
  pausedAt: timestamp("pausedAt", { withTimezone: true }),
  stoppedAt: timestamp("stoppedAt", { withTimezone: true }),
  lastEventAt: timestamp("lastEventAt", { withTimezone: true }),
  lastError: varchar("lastError", { length: 500 }),
  /** KILL_SWITCH | USER_STOP | ERROR | BROKER_DISCONNECT | DAILY_LOSS_LIMIT | null while open */
  endedReason: varchar("endedReason", { length: 32 }),
  /* --- runner working state (server-side; never user-editable) --- */
  arc: varchar("arc", { length: 24 }).notNull().default("idle"), // idle | stalking | holding
  symbol: varchar("symbol", { length: 16 }),
  entry: numeric("entry", { precision: 12, scale: 2 }),
  stop: numeric("stop", { precision: 12, scale: 2 }),
  target: numeric("target", { precision: 12, scale: 2 }),
  quantity: integer("quantity"),
  dayPnl: numeric("dayPnl", { precision: 14, scale: 2 }).notNull().default("0"),
  tradesToday: integer("tradesToday").notNull().default(0),
});
export type AutonomousSession = typeof autonomousSessions.$inferSelect;

export const autonomousEvents = pgTable("autonomous_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: text("sessionId").notNull().references(() => autonomousSessions.id),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  /** MARKET_SCAN | OPPORTUNITY | STRATEGY_SELECTED | RISK_CHECK | ORDER_SUBMITTED |
      BROKER_CONFIRM | POSITION_OPENED | POSITION_MONITOR | EXIT_TRIGGERED |
      POSITION_CLOSED | ERROR | LIFECYCLE */
  phase: varchar("phase", { length: 24 }).notNull(),
  kind: varchar("kind", { length: 16 }).notNull().default("info"), // info | success | warn | risk | trade | error
  symbol: varchar("symbol", { length: 16 }),
  message: text("message").notNull(),
  /** Structured detail (prices, qty, pnl) — rendered by the stream UI. */
  payload: jsonb("payload"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type AutonomousEvent = typeof autonomousEvents.$inferSelect;

/* ---------- RTI Market Data Gateway (durable operational records) ----------
   High-frequency ticks live in the cache/stream layer; PostgreSQL stores only
   durable records: provider health, failures/failovers, and the snapshots
   actually served to Intelligence (traceability of what the AI saw). */

export const indicatorRegistry = pgTable("indicator_registry", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  indicatorId: varchar("indicatorId", { length: 48 }).notNull().unique(), // registry id, e.g. rsi_14
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 32 }).notNull(), // TREND | MOMENTUM | VOLUME | VOLATILITY | PRICE_TRANSFORM | RANGE
  version: varchar("version", { length: 16 }).notNull().default("1.0.0"),
  priority: varchar("priority", { length: 4 }).notNull().default("P1"), // P0..P4
  description: varchar("description", { length: 500 }),
  status: varchar("status", { length: 40 }).notNull().default("RESEARCH_ONLY"), // approval ladder
  dataRequirements: jsonb("dataRequirements").notNull().default({}),
  defaultParameters: jsonb("defaultParameters").notNull().default({}),
  minimumHistory: integer("minimumHistory").notNull().default(1),
  approvedForIntelligence: boolean("approvedForIntelligence").notNull().default(false),
  approvedForBacktesting: boolean("approvedForBacktesting").notNull().default(false),
  approvedForPaper: boolean("approvedForPaper").notNull().default(false),
  approvedForLive: boolean("approvedForLive").notNull().default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const marketDataProviderHealth = pgTable("market_data_provider_health", {
  provider: varchar("provider", { length: 32 }).primaryKey(), // BROKER | YFINANCE | PAPER_EXCHANGE
  status: varchar("status", { length: 16 }).notNull().default("HEALTHY"), // HEALTHY | DEGRADED | UNAVAILABLE
  lastSuccessAt: timestamp("lastSuccessAt", { withTimezone: true }),
  lastFailureAt: timestamp("lastFailureAt", { withTimezone: true }),
  latencyMs: integer("latencyMs"),
  failureCount: integer("failureCount").notNull().default(0),
  detail: varchar("detail", { length: 500 }),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const marketDataEvents = pgTable("market_data_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId"), // null = system-level event
  organizationId: text("organizationId"),
  /** PROVIDER_FAILURE | FAILOVER | SOURCE_CHANGED | STALE_REJECTED | UNAVAILABLE */
  kind: varchar("kind", { length: 24 }).notNull(),
  provider: varchar("provider", { length: 32 }),
  symbol: varchar("symbol", { length: 16 }),
  detail: jsonb("detail"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const marketDataErrors = pgTable("market_data_errors", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 32 }).notNull(),
  symbol: varchar("symbol", { length: 16 }),
  operation: varchar("operation", { length: 24 }).notNull(), // quote | history | indicators
  message: varchar("message", { length: 500 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Snapshot as served to an Intelligence request — what the AI reasoned over. */
export const marketSnapshots = pgTable("market_snapshots", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  source: varchar("source", { length: 32 }).notNull(),
  sourceName: varchar("sourceName", { length: 64 }).notNull(),
  snapshot: jsonb("snapshot").notNull(),
  indicators: jsonb("indicators"),
  validation: jsonb("validation"),
  /** CONSUMED_BY: INTELLIGENCE | AUTONOMOUS */
  consumedBy: varchar("consumedBy", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/* ---------- Learning loop: logged trade outcomes ---------- */

export const tradeOutcomes = pgTable("trade_outcomes", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  strategyId: varchar("strategyId", { length: 64 }).notNull(),
  variantId: varchar("variantId", { length: 64 }),
  source: varchar("source", { length: 24 }).notNull(),
  entry: numeric("entry", { precision: 12, scale: 4 }),
  exitPrice: numeric("exitPrice", { precision: 12, scale: 4 }),
  qty: integer("qty"),
  pnl: numeric("pnl", { precision: 12, scale: 2 }),
  rMultiple: numeric("rMultiple", { precision: 8, scale: 3 }),
  exitReason: varchar("exitReason", { length: 32 }),
  lesson: varchar("lesson", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type TradeOutcome = typeof tradeOutcomes.$inferSelect;

/* ---------- System check module: health reports (owner-facing) ---------- */

export const systemCheckReports = pgTable("system_check_reports", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  triggerType: varchar("triggerType", { length: 24 }).notNull(), // 'PRE_OPEN' | 'POST_CLOSE' | 'MANUAL'
  overall: varchar("overall", { length: 8 }).notNull(), // 'OK' | 'WARN' | 'FAIL'
  okCount: integer("okCount").notNull().default(0),
  warnCount: integer("warnCount").notNull().default(0),
  failCount: integer("failCount").notNull().default(0),
  checksJson: text("checksJson").notNull(),
  aiDiagnosis: text("aiDiagnosis"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type SystemCheckReport = typeof systemCheckReports.$inferSelect;

/* ---------- Portfolio: positions opened from fills, for P&L ---------- */

export const positions = pgTable("positions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  quantity: integer("quantity").notNull(),
  avgEntry: numeric("avgEntry", { precision: 12, scale: 4 }).notNull(),
  sourceTicketId: varchar("sourceTicketId", { length: 64 }),
  /** Execution venue copied from the source ticket at fill time — PAPER | IBKR (mode lineage for reporting). */
  broker: varchar("broker", { length: 24 }).notNull().default("PAPER"),
  status: varchar("status", { length: 24 }).notNull().default("OPEN"),
  openedAt: timestamp("openedAt", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closedAt", { withTimezone: true }),
  exitPrice: numeric("exitPrice", { precision: 12, scale: 4 }),
  realizedPnl: numeric("realizedPnl", { precision: 12, scale: 2 }),
  /* --- trailing-stop state (api/engine/trailing.ts) --- */
  stopPrice: numeric("stopPrice", { precision: 12, scale: 4 }), // original flat stop — governs until the trail arms
  t1Price: numeric("t1Price", { precision: 12, scale: 4 }), // first target — floor reference after scale-outs
  highestPrice: numeric("highestPrice", { precision: 12, scale: 4 }), // highest price since entry
  trailPrice: numeric("trailPrice", { precision: 12, scale: 4 }), // current trail (never moves down)
  trailArmed: boolean("trailArmed").notNull().default(false), // armed once price reaches entry + 1R (CLASSIC) or at entry (IMMEDIATE_TRAIL)
  scaleStage: integer("scaleStage").notNull().default(0), // 0 = full size, 1 = after T1 scale-out, 2 = after T2
  closedBy: varchar("closedBy", { length: 24 }), // FLAT_STOP | TRAIL | SAFETY_FLATTEN | MANUAL_FLATTEN | DISASTER_STOP | null (ticket close)
  t2Price: numeric("t2Price", { precision: 12, scale: 4 }), // second target — T2 scale-out trigger
  overrideMode: varchar("overrideMode", { length: 16 }), // null = module-managed | MANUAL = human owns the exit
  disasterOrderId: varchar("disasterOrderId", { length: 64 }), // resting broker-side catastrophe stop (null on paper)
  disasterPrice: numeric("disasterPrice", { precision: 12, scale: 4 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type Position = typeof positions.$inferSelect;

/* ---------- Canonical signal ledger (Production Revision §10) ---------- */
/* One row per generated signal; 1:1 with its order ticket (ticketId unique). */

export const signals = pgTable("signals", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  signalId: varchar("signalId", { length: 48 }).notNull().unique(), // SIG-[YYYYMMDD]-[seq]
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  strategyId: varchar("strategyId", { length: 64 }).notNull(), // engine strategy or MANUAL/INTELLIGENCE label
  symbol: varchar("symbol", { length: 16 }).notNull(),
  side: varchar("side", { length: 24 }).notNull(),
  signalType: varchar("signalType", { length: 32 }).notNull().default("ENTRY_PROPOSAL"),
  quantity: integer("quantity").notNull(),
  priceAtSignal: numeric("priceAtSignal", { precision: 12, scale: 4 }),
  origin: varchar("origin", { length: 16 }).notNull().default("AUTONOMOUS"), // AUTONOMOUS | INTELLIGENCE | MANUAL
  status: varchar("status", { length: 16 }).notNull().default("GENERATED"), // GENERATED | EXECUTED | EXPIRED | REJECTED | CANCELLED
  ticketId: varchar("ticketId", { length: 40 }).notNull().unique(), // 1:1 with the order ticket — natural idempotency
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
});
export type SignalRow = typeof signals.$inferSelect;

/* ---------- Durable domain events (§4, §25) — idempotent by unique eventId ---------- */

export const domainEvents = pgTable("domain_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: varchar("eventId", { length: 96 }).notNull().unique(), // e.g. MARKET_OPENED:2026-08-14
  type: varchar("type", { length: 48 }).notNull(),
  payload: text("payload"), // JSON projection — minimum disclosure
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type DomainEventRow = typeof domainEvents.$inferSelect;

/* ---------- Audit trail (§27) — append-only, tamper-resistant by convention ---------- */

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId"), // null = system actor
  action: varchar("action", { length: 64 }).notNull(), // ORDER_PROPOSED | ORDER_CONFIRMED | ...
  entityType: varchar("entityType", { length: 32 }).notNull(), // TICKET | STRATEGY | SETTING | SIGNAL | SESSION
  entityId: varchar("entityId", { length: 64 }),
  prevState: varchar("prevState", { length: 48 }),
  newState: varchar("newState", { length: 48 }),
  correlationId: varchar("correlationId", { length: 64 }),
  meta: text("meta"), // JSON — minimum disclosure, never secrets
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
export type AuditEventRow = typeof auditEvents.$inferSelect;

/* ---------- Legal document CMS (Legal Revision §40–§42) — versioned, no silent overwrite ----------
   State machine: DRAFT → LEGAL_REVIEW → APPROVED → SCHEDULED → ACTIVE → SUPERSEDED.
   Only APPROVED documents may be activated; activation is an explicit human transition.
   Historical versions are NEVER updated in place — a change is a new row. */

export const legalDocuments = pgTable("legal_documents", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 64 }).notNull(), // e.g. terms-of-service
  title: varchar("title", { length: 191 }).notNull(),
  category: varchar("category", { length: 48 }).notNull(), // GENERAL | TRADING_DISCLOSURES | MARKETPLACE | PRIVACY_SECURITY | BUSINESS
  version: varchar("version", { length: 24 }).notNull(), // e.g. 0.9-counsel-review
  status: varchar("status", { length: 24 })
    .notNull()
    .default("DRAFT"),
  effectiveDate: varchar("effectiveDate", { length: 10 }), // YYYY-MM-DD, set at activation
  requiresReconsent: boolean("requiresReconsent").notNull().default(false),
  content: text("content").notNull(), // markdown-ish body
  approvedBy: varchar("approvedBy", { length: 191 }), // human approver label, set on APPROVED transition
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type LegalDocumentRow = typeof legalDocuments.$inferSelect;

/* ---------- Versioned legal acceptance (§8) — never termsAccepted=true alone ---------- */

export const legalAcceptances = pgTable("legal_acceptances", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  consentRecordId: varchar("consentRecordId", { length: 40 }).notNull().unique(),
  userId: text("userId").notNull(),
  documentSlug: varchar("documentSlug", { length: 64 }).notNull(),
  documentVersion: varchar("documentVersion", { length: 24 }).notNull(),
  documentId: text("documentId"),
  effectiveDate: varchar("effectiveDate", { length: 10 }),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true }).defaultNow().notNull(),
  method: varchar("method", { length: 40 }).notNull(), // CLICKWRAP_SIGNUP | AUTONOMOUS_ACTIVATION | MARKETPLACE_ACCEPT | RE_CONSENT | PRIVACY_CENTER
  context: varchar("context", { length: 64 }), // app surface, e.g. /app/autonomous
  locale: varchar("locale", { length: 16 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 255 }),
});
export type LegalAcceptanceRow = typeof legalAcceptances.$inferSelect;

/* ---------- Consent preferences (§36–§37) — optional consent is never bundled ---------- */

export const consentPreferences = pgTable("consent_preferences", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull().unique(),
  marketingEmail: boolean("marketingEmail").notNull().default(false),
  marketingSms: boolean("marketingSms").notNull().default(false),
  analyticsCookies: boolean("analyticsCookies").notNull().default(false),
  /** Server-side record that a valid opt-out preference signal (GPC) was honored (§14). */
  gpcHonored: boolean("gpcHonored").notNull().default(false),
  gpcLastSeenAt: timestamp("gpcLastSeenAt", { withTimezone: true }),
  ageAttestedAt: timestamp("ageAttestedAt", { withTimezone: true }), // 18+ attestation (§28)
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type ConsentPreferenceRow = typeof consentPreferences.$inferSelect;

/* ---------- Privacy requests (§38) — logged, verifiable workflow ---------- */

export const privacyRequests = pgTable("privacy_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("requestId", { length: 40 }).notNull().unique(), // PR-xxxxxxxx
  userId: text("userId").notNull(),
  type: varchar("type", { length: 24 }).notNull(),
  status: varchar("status", { length: 24 })
    .notNull()
    .default("RECEIVED"),
  details: text("details"),
  responseNote: text("responseNote"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  completedAt: timestamp("completedAt", { withTimezone: true }),
});
export type PrivacyRequestRow = typeof privacyRequests.$inferSelect;

/* ---------- Cookie consent (§15) — statutory choice stored server-side; cookie holds only the ID ---------- */

export const cookieConsents = pgTable("cookie_consents", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  consentId: varchar("consentId", { length: 40 }).notNull().unique(), // uuid referenced by the browser cookie
  userId: text("userId"), // nullable: pre-login visitors
  analytics: boolean("analytics").notNull().default(false),
  functional: boolean("functional").notNull().default(true),
  advertising: boolean("advertising").notNull().default(false),
  gpcSignal: boolean("gpcSignal").notNull().default(false),
  locale: varchar("locale", { length: 16 }),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: varchar("userAgent", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
export type CookieConsentRow = typeof cookieConsents.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-TENANT ARCHITECTURE (§7, §10): ORGANIZATION → WORKSPACE → TEAM → USER
// ═══════════════════════════════════════════════════════════════════════════

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  /** PERSONAL (auto-created per user) | ENTERPRISE (Contact Sales — no public pricing) */
  type: varchar("type", { length: 16 }).notNull().default("PERSONAL"),
  ownerId: text("ownerId").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull().references(() => organizations.id),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const teams = pgTable("teams", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull().references(() => organizations.id),
  workspaceId: text("workspaceId").references(() => workspaces.id),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Enterprise hierarchy (§10): ENTERPRISE_OWNER → ENTERPRISE_ADMIN → TEAM_MANAGER → TRADER_ANALYST → VIEWER. */
export const memberships = pgTable("memberships", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull().references(() => organizations.id),
  workspaceId: text("workspaceId").references(() => workspaces.id),
  teamId: text("teamId").references(() => teams.id),
  userId: text("userId").notNull().references(() => users.id),
  orgRole: varchar("orgRole", { length: 32 }).notNull().default("MEMBER"),
  status: varchar("status", { length: 16 }).notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
  invitedBy: text("invitedBy"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull().references(() => organizations.id),
  teamId: text("teamId").references(() => teams.id),
  email: varchar("email", { length: 320 }).notNull(),
  orgRole: varchar("orgRole", { length: 32 }).notNull().default("MEMBER"),
  token: varchar("token", { length: 128 }).notNull().unique(),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | ACCEPTED | REVOKED | EXPIRED
  invitedBy: text("invitedBy").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// MARKETPLACE V2 (§16): creators, versions, purchases, payouts, disputes
// ═══════════════════════════════════════════════════════════════════════════

export const creators = pgTable("creators", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull().references(() => users.id).unique(),
  displayName: varchar("displayName", { length: 255 }).notNull(),
  bio: text("bio"),
  status: varchar("status", { length: 16 }).notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
  payoutRef: varchar("payoutRef", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const strategyVersions = pgTable("strategy_versions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: text("itemId").notNull().references(() => marketplaceItems.id),
  version: integer("version").notNull(),
  prompt: text("prompt").notNull(),
  changelog: text("changelog"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Marketplace purchases — idempotent via idempotencyKey (§34). */
export const purchases = pgTable("purchases", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: text("itemId").notNull(),
  buyerUserId: text("buyerUserId").notNull(),
  organizationId: text("organizationId"),
  amountCents: integer("amountCents").notNull(),
  platformFeeCents: integer("platformFeeCents").notNull().default(0),
  creatorEarningCents: integer("creatorEarningCents").notNull().default(0),
  providerPaymentId: varchar("providerPaymentId", { length: 128 }),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | COMPLETED | REFUNDED | FAILED
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const payouts = pgTable("payouts", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  creatorId: text("creatorId").notNull().references(() => creators.id),
  amountCents: integer("amountCents").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | PAID | FAILED
  periodStart: timestamp("periodStart", { withTimezone: true }),
  periodEnd: timestamp("periodEnd", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const disputes = pgTable("disputes", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  purchaseId: text("purchaseId").notNull().references(() => purchases.id),
  openedBy: text("openedBy").notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("OPEN"), // OPEN | RESOLVED | REJECTED
  resolution: text("resolution"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
});

/** Append-only daily rollup per listing. */
export const marketplaceAnalytics = pgTable("marketplace_analytics", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: text("itemId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  views: integer("views").notNull().default(0),
  purchases: integer("purchases").notNull().default(0),
  revenueCents: integer("revenueCents").notNull().default(0),
});

// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE (§18) & AI/AGENT OBSERVABILITY (§31) — no chain-of-thought
// ═══════════════════════════════════════════════════════════════════════════

export const intelligenceRequests = pgTable("intelligence_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  kind: varchar("kind", { length: 32 }).notNull().default("QUERY"), // QUERY | RESEARCH | REPORT
  query: text("query").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | RUNNING | COMPLETED | FAILED
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const intelligenceResults = pgTable("intelligence_results", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: text("requestId").references(() => intelligenceRequests.id),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  title: varchar("title", { length: 255 }),
  output: text("output").notNull(),
  /** Source lineage / citations only — never hidden model reasoning. */
  sources: jsonb("sources"),
  model: varchar("model", { length: 128 }),
  latencyMs: integer("latencyMs"),
  tokensUsed: integer("tokensUsed"),
  estCostCents: integer("estCostCents"),
  saved: boolean("saved").notNull().default(false),
  feedback: varchar("feedback", { length: 16 }), // UP | DOWN
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type IntelligenceResult = typeof intelligenceResults.$inferSelect;

/** Per-user Intelligence watchlist — triggers background Engine A prefetch (PDF §6). */
export const intelligenceWatchlist = pgTable("intelligence_watchlist", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId")
    .notNull()
    .references(() => users.id),
  symbol: varchar("symbol", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export type IntelligenceWatchlistRow = typeof intelligenceWatchlist.$inferSelect;

/** Operational telemetry for every AI/agent run (§31). */
export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("runId", { length: 64 }).notNull().unique(),
  correlationId: varchar("correlationId", { length: 64 }),
  agent: varchar("agent", { length: 64 }).notNull(),
  organizationId: text("organizationId"),
  userId: text("userId"),
  model: varchar("model", { length: 128 }),
  provider: varchar("provider", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("RUNNING"), // RUNNING | SUCCEEDED | FAILED
  startedAt: timestamp("startedAt", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("endedAt", { withTimezone: true }),
  latencyMs: integer("latencyMs"),
  toolCalls: jsonb("toolCalls"),
  error: text("error"),
  retryCount: integer("retryCount").notNull().default(0),
  tokensUsed: integer("tokensUsed"),
  estCostCents: integer("estCostCents"),
  artifactRef: text("artifactRef"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTONOMOUS DURABILITY (§19) & KILL SWITCHES (§20)
// ═══════════════════════════════════════════════════════════════════════════

/** GLOBAL | ORGANIZATION | BROKER_ACCOUNT | STRATEGY | AGENT | USER scopes. */
export const killSwitches = pgTable("kill_switches", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: varchar("scope", { length: 24 }).notNull(),
  targetId: text("targetId").notNull().default("*"),
  active: boolean("active").notNull().default(true),
  activatedBy: text("activatedBy").notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const riskEvents = pgTable("risk_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId"),
  organizationId: text("organizationId"),
  runSessionId: text("runSessionId"),
  kind: varchar("kind", { length: 48 }).notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("WARNING"),
  detail: jsonb("detail"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull().references(() => users.id),
  accountId: text("accountId"),
  equity: numeric("equity", { precision: 16, scale: 2 }).notNull(),
  cash: numeric("cash", { precision: 16, scale: 2 }),
  positions: jsonb("positions"),
  capturedAt: timestamp("capturedAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Human approvals for autonomous/agent actions that require sign-off (§19). */
export const approvals = pgTable("approvals", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  kind: varchar("kind", { length: 48 }).notNull(),
  refId: text("refId"),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
  decidedBy: text("decidedBy"),
  decidedAt: timestamp("decidedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// BILLING (§13–§15) — platform accounting, separate from trading data.
// Never stores PAN/CVV — provider metadata only.
// ═══════════════════════════════════════════════════════════════════════════

export const plans = pgTable("plans", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 32 }).notNull().unique(), // BASIC | PRO | ENTERPRISE
  name: varchar("name", { length: 128 }).notNull(),
  priceMonthlyCents: integer("priceMonthlyCents").notNull().default(0),
  entitlements: jsonb("entitlements").notNull().default({}),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  planId: text("planId").notNull().references(() => plans.id),
  provider: varchar("provider", { length: 32 }).notNull().default("STRIPE"),
  providerCustomerId: varchar("providerCustomerId", { length: 128 }),
  providerSubscriptionId: varchar("providerSubscriptionId", { length: 128 }),
  status: varchar("status", { length: 16 }).notNull().default("TRIALING"), // TRIALING | ACTIVE | PAST_DUE | CANCELED | INCOMPLETE
  trialEndsAt: timestamp("trialEndsAt", { withTimezone: true }),
  currentPeriodStart: timestamp("currentPeriodStart", { withTimezone: true }),
  currentPeriodEnd: timestamp("currentPeriodEnd", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").notNull().default(false),
  canceledAt: timestamp("canceledAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: text("subscriptionId").notNull().references(() => subscriptions.id),
  organizationId: text("organizationId").notNull(),
  providerInvoiceId: varchar("providerInvoiceId", { length: 128 }).unique(),
  amountCents: integer("amountCents").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("usd"),
  status: varchar("status", { length: 16 }).notNull().default("OPEN"), // OPEN | PAID | VOID | UNCOLLECTIBLE
  periodStart: timestamp("periodStart", { withTimezone: true }),
  periodEnd: timestamp("periodEnd", { withTimezone: true }),
  issuedAt: timestamp("issuedAt", { withTimezone: true }).defaultNow().notNull(),
  paidAt: timestamp("paidAt", { withTimezone: true }),
});

export const payments = pgTable("payments", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: text("invoiceId").references(() => invoices.id),
  organizationId: text("organizationId").notNull(),
  providerPaymentId: varchar("providerPaymentId", { length: 128 }),
  amountCents: integer("amountCents").notNull(),
  currency: varchar("currency", { length: 8 }).notNull().default("usd"),
  status: varchar("status", { length: 16 }).notNull(), // SUCCEEDED | FAILED | REFUNDED
  failureCode: varchar("failureCode", { length: 64 }),
  failureMessage: text("failureMessage"),
  attemptedAt: timestamp("attemptedAt", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const refunds = pgTable("refunds", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: text("paymentId").notNull().references(() => payments.id),
  organizationId: text("organizationId").notNull(),
  amountCents: integer("amountCents").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | COMPLETED | FAILED
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const credits = pgTable("credits", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  amountCents: integer("amountCents").notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 16 }).notNull().default("AVAILABLE"), // AVAILABLE | APPLIED | EXPIRED
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Safe payment-provider metadata only — never card numbers or CVV (§13). */
export const paymentMethods = pgTable("payment_methods", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  providerMethodId: varchar("providerMethodId", { length: 128 }).notNull(),
  brand: varchar("brand", { length: 32 }),
  last4: varchar("last4", { length: 4 }),
  expMonth: integer("expMonth"),
  expYear: integer("expYear"),
  isDefault: boolean("isDefault").notNull().default(false),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId"),
  type: varchar("type", { length: 64 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Cancellation request workflow (§15) — never silently cancel when review is required. */
export const cancellationRequests = pgTable("cancellation_requests", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  userId: text("userId").notNull(),
  subscriptionId: text("subscriptionId").references(() => subscriptions.id),
  reason: text("reason"),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | APPROVED | DENIED | COMPLETED
  assignedTo: text("assignedTo"),
  resolution: text("resolution"),
  requestedAt: timestamp("requestedAt", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
});

/** Payment-provider webhook log — verified, idempotent, safely retryable (§14, §34). */
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar("provider", { length: 32 }).notNull(),
  eventId: varchar("eventId", { length: 128 }).notNull(),
  type: varchar("type", { length: 128 }).notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true }),
  processError: text("processError"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Generic idempotency registry for financial/operational actions (§34). */
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key", { length: 128 }).primaryKey(),
  userId: text("userId"),
  endpoint: varchar("endpoint", { length: 255 }).notNull(),
  responseStatus: integer("responseStatus"),
  responseBody: jsonb("responseBody"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS (§24)
// ═══════════════════════════════════════════════════════════════════════════

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  organizationId: text("organizationId"),
  /** IN_APP | EMAIL | OPS | BILLING | SECURITY | SYSTEM */
  category: varchar("category", { length: 16 }).notNull().default("IN_APP"),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  readAt: timestamp("readAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("userId").notNull(),
  category: varchar("category", { length: 16 }).notNull(),
  inAppEnabled: boolean("inAppEnabled").notNull().default(true),
  emailEnabled: boolean("emailEnabled").notNull().default(true),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationId: text("notificationId").notNull().references(() => notifications.id),
  channel: varchar("channel", { length: 16 }).notNull(), // IN_APP | EMAIL
  status: varchar("status", { length: 16 }).notNull().default("QUEUED"), // QUEUED | SENT | FAILED
  error: text("error"),
  attemptedAt: timestamp("attemptedAt", { withTimezone: true }),
});

export const notificationTemplates = pgTable("notification_templates", {
  code: varchar("code", { length: 64 }).primaryKey(),
  subject: varchar("subject", { length: 255 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const alertRules = pgTable("alert_rules", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 128 }).notNull(),
  module: varchar("module", { length: 64 }).notNull(),
  condition: jsonb("condition").notNull(),
  severity: varchar("severity", { length: 16 }).notNull().default("WARNING"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS (§23) & LIBRARY (§21) — metadata here, binaries in object storage
// ═══════════════════════════════════════════════════════════════════════════

export const reports = pgTable("reports", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  userId: text("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  definition: jsonb("definition").notNull(),
  schedule: varchar("schedule", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const reportRuns = pgTable("report_runs", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  reportId: text("reportId").notNull().references(() => reports.id),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"), // PENDING | RUNNING | COMPLETED | FAILED
  params: jsonb("params"),
  exportRef: text("exportRef"),
  requestedBy: text("requestedBy").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
});

export const libraryDocuments = pgTable("library_documents", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: text("organizationId").notNull(),
  userId: text("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  storagePath: text("storagePath").notNull(), // Supabase Storage / S3 object key
  sizeBytes: integer("sizeBytes"),
  mimeType: varchar("mimeType", { length: 128 }),
  tags: jsonb("tags").notNull().default([]),
  category: varchar("category", { length: 64 }),
  status: varchar("status", { length: 16 }).notNull().default("UPLOADED"), // UPLOADED | PROCESSING | INDEXED | FAILED
  version: integer("version").notNull().default(1),
  provenance: text("provenance"),
  embeddingRef: text("embeddingRef"), // pgvector reference when indexing is enabled
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
  deletedAt: timestamp("deletedAt", { withTimezone: true }),
});

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM OPERATIONS: AUDIT LOG (§29), FEATURE FLAGS (§30),
// HEALTH (§25/26/28), INCIDENTS (§27)
// ═══════════════════════════════════════════════════════════════════════════

/** Append-only audit log — SQL trigger rejects UPDATE/DELETE (0001_rls.sql). */
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: text("actorUserId"), // null = system actor
  organizationId: text("organizationId"),
  action: varchar("action", { length: 128 }).notNull(),
  targetType: varchar("targetType", { length: 64 }),
  targetId: text("targetId"),
  ip: varchar("ip", { length: 64 }),
  userAgent: varchar("userAgent", { length: 255 }),
  before: jsonb("before"),
  after: jsonb("after"),
  correlationId: varchar("correlationId", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

/** Feature flags (§30): global / environment / plan / organization / user / module. */
export const featureFlags = pgTable("feature_flags", {
  key: varchar("key", { length: 128 }).primaryKey(),
  description: text("description"),
  enabledGlobal: boolean("enabledGlobal").notNull().default(false),
  enabledEnvironments: jsonb("enabledEnvironments").notNull().default([]),
  planCodes: jsonb("planCodes").notNull().default([]),
  organizationIds: jsonb("organizationIds").notNull().default([]),
  userIds: jsonb("userIds").notNull().default([]),
  moduleOverrides: jsonb("moduleOverrides").notNull().default({}),
  updatedBy: text("updatedBy"),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

/** Health check results — LIGHT (continuous) and DEEP (twice-daily) layers (§26). */
export const healthChecks = pgTable("health_checks", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  component: varchar("component", { length: 64 }).notNull(),
  test: varchar("test", { length: 128 }).notNull(),
  layer: varchar("layer", { length: 8 }).notNull().default("LIGHT"), // LIGHT | DEEP
  status: varchar("status", { length: 8 }).notNull(), // PASS | WARN | FAIL
  latencyMs: integer("latencyMs"),
  error: text("error"),
  severity: varchar("severity", { length: 16 }).notNull().default("INFO"),
  module: varchar("module", { length: 64 }),
  metadata: jsonb("metadata"),
  remediationStatus: varchar("remediationStatus", { length: 16 }).default("NONE"), // NONE | OPEN | RESOLVED
  startedAt: timestamp("startedAt", { withTimezone: true }).notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  service: varchar("service", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  error: text("error"),
  severity: varchar("severity", { length: 16 }).notNull(), // INFO | WARNING | HIGH | CRITICAL
  status: varchar("status", { length: 16 }).notNull().default("OPEN"), // OPEN | ACKNOWLEDGED | INVESTIGATING | MONITORING | RESOLVED
  detectedAt: timestamp("detectedAt", { withTimezone: true }).defaultNow().notNull(),
  assignedTo: text("assignedTo"),
  acknowledgedAt: timestamp("acknowledgedAt", { withTimezone: true }),
  resolvedAt: timestamp("resolvedAt", { withTimezone: true }),
  rootCause: text("rootCause"),
  postmortem: text("postmortem"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull().$onUpdate(() => new Date()),
});

export const incidentUpdates = pgTable("incident_updates", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  incidentId: text("incidentId").notNull().references(() => incidents.id),
  actorUserId: text("actorUserId"),
  action: varchar("action", { length: 64 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});
