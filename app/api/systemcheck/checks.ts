import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, orderTickets, chatMessages, tradeOutcomes } from "@db/schema";
import { marketDataService } from "../marketdata/service";
import { publicPackageStatus } from "../governance/runtime";
import { BUILTIN_CONFIGS, loadConfig } from "../engine/config";
import { TRIGGERS, runTrigger } from "../engine/triggers";
import { sizePosition } from "../engine/risk";
import { listMonitors } from "../engine/monitor";
import { trailingStatus } from "../engine/trailing";
import type { Bar } from "../marketdata/indicators";

/**
 * SYSTEM CHECK — component health probes.
 *
 * Each check is a real, executable probe — not a ping that always passes.
 * The signal check, for example, feeds synthetic bars through the actual
 * trigger functions and asserts the expected output: it proves the signal
 * math FIRES, not merely that the file imports.
 *
 * Every check returns a remediation hint so failures arrive with a fix,
 * and the AI diagnosis layer (service.ts) turns those into full
 * what-broken / why / how-to-fix / how-to-improve guidance.
 */

export interface CheckResult {
  id: string;
  name: string;
  status: "OK" | "WARN" | "FAIL";
  detail: string;
  remediation?: string;
}

type CheckFn = () => Promise<CheckResult>;

function ok(id: string, name: string, detail: string): CheckResult {
  return { id, name, status: "OK", detail };
}
function warn(id: string, name: string, detail: string, remediation: string): CheckResult {
  return { id, name, status: "WARN", detail, remediation };
}
function fail(id: string, name: string, detail: string, remediation: string): CheckResult {
  return { id, name, status: "FAIL", detail, remediation };
}

/* ---------- 1. environment ---------- */

const checkEnvironment: CheckFn = async () => {
  const id = "environment";
  const name = "Environment & secrets";
  const missing: string[] = [];
  if (!process.env.APP_ID) missing.push("APP_ID");
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.GOVERNANCE_VAULT_KEY) missing.push("GOVERNANCE_VAULT_KEY");
  if (missing.length > 0) {
    return fail(id, name, `Missing required env vars: ${missing.join(", ")} — governance and/or database will refuse to operate`,
      "Set the missing variables in the deployment environment and restart the service.");
  }
  const warnings: string[] = [];
  if (!process.env.OPENAI_API_KEY) warnings.push("OPENAI_API_KEY not set — Intelligence runs in fallback mode");
  if (!process.env.IBKR_GATEWAY_URL) warnings.push("IBKR_GATEWAY_URL not set — data feed targets localhost default");
  if (warnings.length > 0) {
    return warn(id, name, warnings.join(" · "),
      "Set the listed variables in deployment. OPENAI_API_KEY restores full Intelligence; IBKR_GATEWAY_URL points the feed at the real Client Portal gateway.");
  }
  return ok(id, name, "All required and optional env vars present");
};

/* ---------- 2. database ---------- */

const checkDatabase: CheckFn = async () => {
  const id = "database";
  const name = "Database";
  try {
    const db = getDb();
    await db.select({ id: users.id }).from(users).limit(1);
    // verify the newer tables this module depends on
    await db.select({ id: chatMessages.id }).from(chatMessages).limit(1);
    await db.select({ id: tradeOutcomes.id }).from(tradeOutcomes).limit(1);
    return ok(id, name, "Connection healthy; core + memory + learning tables present");
  } catch (e) {
    return fail(id, name, `Database error: ${(e as Error).message}`,
      "Check DATABASE_URL and that the PostgreSQL instance is reachable from this deployment. Boot runs the version-controlled migrations in db/migrations — a missing table here means migrations failed; check server logs.");
  }
};

/* ---------- 3. governance ---------- */

const checkGovernance: CheckFn = async () => {
  const id = "governance";
  const name = "Governance package";
  try {
    const pkgs = await publicPackageStatus();
    const active = pkgs.find((p) => p.status === "ACTIVE");
    if (!active) {
      return fail(id, name, "NO ACTIVE governance package — engine config loading will throw GOVERNANCE_UNAVAILABLE",
        "Boot should stage a genesis package via ensureGovernanceReady(). Check GOVERNANCE_VAULT_KEY is set and inspect governance router status; activate a signed package manually if needed.");
    }
    return ok(id, name, `Package ${active.version} ACTIVE (hash ${active.hashShort})`);
  } catch (e) {
    return fail(id, name, `Governance status error: ${(e as Error).message}`,
      "Check the governance runtime and vault key; the engine cannot run without an active signed package.");
  }
};

/* ---------- 4. market data feed (with safe auto-remediation) ---------- */

const checkMarketData: CheckFn = async () => {
  const id = "market_data";
  const name = "Market data feed";
  try {
    const feed = await marketDataService.status();
    const problems: string[] = [];
    if (!feed.gatewayOk) problems.push(`gateway DOWN (${feed.gatewayDetail})`);
    if (feed.marketOpen && !feed.loopRunning && feed.symbols.length > 0) {
      // SAFE auto-remediation: the loop is supposed to run during market hours — restart it.
      marketDataService.ensureLoop();
      problems.push("refresh loop was down during market hours — AUTO-REMEDIATED (restarted)");
    }
    const errored = feed.symbols.filter((s) => s.error);
    if (errored.length > 0) problems.push(`${errored.length} tracked symbol(s) erroring: ${errored.map((s) => s.symbol).join(", ")}`);
    if (feed.symbols.length === 0) problems.push("no symbols tracked — scanner and monitors have nothing to evaluate");
    if (problems.length > 0) {
      const isFail = !feed.gatewayOk && feed.symbols.length > 0;
      const detail = problems.join(" · ");
      const status = isFail ? "FAIL" : "WARN";
      return (status === "FAIL" ? fail : warn)(id, name, detail,
        "Verify the IBKR Client Portal gateway is running and authenticated (GET /iserver/auth/status). If the gateway is intentional (off-hours / dev), this is expected. Track symbols via the Data Feed panel.");
    }
    return ok(id, name, `gateway OK · market ${feed.marketOpen ? "OPEN" : "CLOSED"} · ${feed.symbols.length} symbol(s) tracked · loop ${feed.loopRunning ? "running" : "standby (off-hours)"}`);
  } catch (e) {
    return fail(id, name, `Feed status error: ${(e as Error).message}`,
      "Inspect the marketdata service and gateway connectivity.");
  }
};

/* ---------- 5. engine configs (governance-clamped) ---------- */

const checkEngineConfigs: CheckFn = async () => {
  const id = "engine_configs";
  const name = "Engine configs & governance clamps";
  try {
    const loaded: string[] = [];
    for (const c of BUILTIN_CONFIGS) {
      const { config, clamps, governanceVersion } = await loadConfig(c.strategy_id);
      loaded.push(`${config.strategy_id} v${config.version} (${clamps.length} clamp(s), gov ${governanceVersion})`);
    }
    return ok(id, name, `${BUILTIN_CONFIGS.length} configs load under governance: ${loaded.join(" · ")}`);
  } catch (e) {
    return fail(id, name, `Config load failed: ${(e as Error).message}`,
      "If this is GOVERNANCE_UNAVAILABLE, activate a governance package first. Otherwise inspect engine/config.ts clamping against the active package ceiling.");
  }
};

/* ---------- 6. signals self-test (proves the math fires) ---------- */

function syntheticBar(t: number, c: number, v = 100): Bar {
  return { t, o: c, h: c + 0.1, l: c - 0.1, c, v };
}

const checkSignals: CheckFn = async () => {
  const id = "signals";
  const name = "Signal stack self-test";
  const problems: string[] = [];
  try {
    const triggerCount = Object.keys(TRIGGERS).length;
    if (triggerCount < 9) problems.push(`trigger registry has ${triggerCount} entries, expected ≥ 9`);

    // Positive test: dip below VWAP then reclaim and hold → MUST arm
    const t0 = Date.UTC(2026, 0, 5, 14, 30); // fixed synthetic session
    const session: Bar[] = [
      syntheticBar(t0 + 0 * 60000, 100),
      syntheticBar(t0 + 1 * 60000, 100),
      syntheticBar(t0 + 2 * 60000, 100),
      syntheticBar(t0 + 3 * 60000, 99), // below vwap
      syntheticBar(t0 + 4 * 60000, 102),
      syntheticBar(t0 + 5 * 60000, 102),
      syntheticBar(t0 + 6 * 60000, 102),
      syntheticBar(t0 + 7 * 60000, 102),
    ];
    const pos = runTrigger("vwap_reclaim", { session, priorDay: { high: 101, low: 98, close: 99.5 } }, { hold_minutes: 3 });
    if (!pos.armed) problems.push(`vwap_reclaim FAILED to arm on a textbook reclaim pattern (evidence: ${JSON.stringify(pos.evidence)})`);

    // Negative test: never below VWAP → MUST NOT arm (guards against always-on regression)
    const flat = Array.from({ length: 8 }, (_, i) => syntheticBar(t0 + i * 60000, 100 + i * 0.01));
    const neg = runTrigger("vwap_reclaim", { session: flat, priorDay: { high: 101, low: 98, close: 99.5 } }, { hold_minutes: 3 });
    if (neg.armed) problems.push("vwap_reclaim armed WITHOUT a prior dip — trigger logic regressed");

    // Risk sizing sanity: 0.5% of 100k = $500 risk, $1/share → 500 qty, capped by 25% position cap
    const sizing = sizePosition({ accountEquity: 100000, entry: 100, stop: 99, maxRiskPct: 0.5, maxPositionPct: 25 });
    if (!(sizing.qty > 0)) problems.push("sizePosition returned zero qty on a valid setup");
    if (sizing.dollarRisk > 500.01) problems.push(`sizePosition risk $${sizing.dollarRisk} exceeds the $500 ceiling — risk math regressed`);
    if (sizing.positionValue > 25000.01) problems.push(`sizePosition value $${sizing.positionValue} exceeds the 25% position cap`);

    if (problems.length > 0) {
      return fail(id, name, problems.join(" · "),
        "Signal or risk math regressed — do NOT trust live proposals until fixed. Run engine.backtest on a tracked symbol to reproduce, then inspect engine/triggers.ts and engine/risk.ts.");
    }
    return ok(id, name, `${triggerCount} triggers registered · reclaim self-test armed correctly · negative test held · risk sizing within ceilings (qty ${sizing.qty}, risk $${sizing.dollarRisk.toFixed(0)})`);
  } catch (e) {
    return fail(id, name, `Signal self-test threw: ${(e as Error).message}`,
      "A trigger or risk function crashed on synthetic input — inspect engine/triggers.ts and engine/risk.ts before trusting any proposal.");
  }
};

/* ---------- 7. autonomous monitors ---------- */

const checkAutonomous: CheckFn = async () => {
  const id = "autonomous";
  const name = "Autonomous monitors";
  try {
    const db = getDb();
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    let total = 0;
    const states = new Map<string, number>();
    for (const a of admins) {
      for (const m of listMonitors(a.id)) {
        total += 1;
        states.set(m.state, (states.get(m.state) ?? 0) + 1);
      }
    }
    if (total === 0) return ok(id, name, "No active monitors (idle is a valid state — monitors start from the Engine panel or scanner)");
    const breakdown = [...states.entries()].map(([s, n]) => `${s}:${n}`).join(" · ");
    const killed = states.get("KILLED") ?? 0;
    if (killed > 0) {
      return warn(id, name, `${total} monitor(s): ${breakdown} — ${killed} KILLED monitor(s) present`,
        "Inspect killed monitors' last events (engine.monitors) — a kill means the state machine invalidated the setup, which is working as designed, but repeated kills on the same symbol suggest a config/feed issue.");
    }
    return ok(id, name, `${total} monitor(s) active: ${breakdown}`);
  } catch (e) {
    return fail(id, name, `Monitor check error: ${(e as Error).message}`,
      "Inspect engine/monitor.ts — monitors failing to enumerate means the autonomous path is unhealthy.");
  }
};

/* ---------- 8. ticket gate ---------- */

const checkTicketGate: CheckFn = async () => {
  const id = "ticket_gate";
  const name = "Order ticket gate";
  try {
    const db = getDb();
    const recent = await db.select().from(orderTickets).orderBy(desc(orderTickets.id)).limit(50);
    const now = Date.now();
    const staleAwaiting = recent.filter(
      (t) => t.state === "READY_FOR_CONFIRMATION" && t.expiresAt && new Date(t.expiresAt).getTime() < now - 10 * 60 * 1000
    );
    if (staleAwaiting.length > 0) {
      return warn(id, name, `${staleAwaiting.length} ticket(s) still READY_FOR_CONFIRMATION past expiry — expiry sweeper may not be running`,
        "Expired tickets must never route. Verify the ticket expiry/sweep path in queries/tickets.ts; stale rows should transition to EXPIRED.");
    }
    const byState = new Map<string, number>();
    for (const t of recent) byState.set(t.state, (byState.get(t.state) ?? 0) + 1);
    return ok(id, name, `Ticket store healthy · recent ${recent.length}: ${[...byState.entries()].map(([s, n]) => `${s}:${n}`).join(" · ") || "none yet"}`);
  } catch (e) {
    return fail(id, name, `Ticket gate error: ${(e as Error).message}`,
      "The confirmation gate is the ONLY path to a broker — if it errors, treat as critical. Inspect queries/tickets.ts and the order_tickets table.");
  }
};

/* ---------- 9. intelligence (live ping) ---------- */

const checkIntelligence: CheckFn = async () => {
  const id = "intelligence";
  const name = "Intelligence (LLM)";
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return warn(id, name, "OPENAI_API_KEY not set — chat runs on canned fallback answers only",
      "Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in deployment to enable the reasoning loop.");
  }
  try {
    const started = Date.now();
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 8,
      }),
    });
    const latency = Date.now() - started;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      return fail(id, name, `OpenAI ping failed: HTTP ${res.status} — ${body}`,
        "Check the API key validity, billing/quota, and that OPENAI_MODEL names a model your account can access. Intelligence falls back to canned answers while this fails.");
    }
    return ok(id, name, `Model ${process.env.OPENAI_MODEL ?? "gpt-5.6"} responding (${latency}ms)`);
  } catch (e) {
    return fail(id, name, `OpenAI ping error: ${(e as Error).message}`,
      "Network path to api.openai.com failed from this deployment — check egress/proxy. Intelligence falls back to canned answers.");
  }
};

/* ---------- 10. memory ---------- */

const checkMemory: CheckFn = async () => {
  const id = "memory";
  const name = "Conversation memory";
  try {
    const db = getDb();
    const rows = await db.select({ id: chatMessages.id }).from(chatMessages).orderBy(desc(chatMessages.id)).limit(1);
    return ok(id, name, `Memory table healthy (${rows.length > 0 ? "messages present" : "empty — no chats yet, which is fine"})`);
  } catch (e) {
    return fail(id, name, `Memory error: ${(e as Error).message}`,
      "chat_messages table missing or unreadable — boot migrations should have created it; check server logs and DATABASE_URL permissions.");
  }
};

/* ---------- 11. learning loop ---------- */

const checkLearning: CheckFn = async () => {
  const id = "learning";
  const name = "Learning loop";
  try {
    const db = getDb();
    const rows = await db.select({ id: tradeOutcomes.id }).from(tradeOutcomes).orderBy(desc(tradeOutcomes.id)).limit(1);
    if (rows.length === 0) {
      return warn(id, name, "Learning table healthy but EMPTY — no outcomes logged yet, so the system has nothing to learn from",
        "Run a backtest (Engine panel or ask Intelligence) — outcomes start flowing automatically from there. Paper/live outcomes hook in as those paths close trades.");
    }
    return ok(id, name, "Learning table healthy with logged outcomes");
  } catch (e) {
    return fail(id, name, `Learning loop error: ${(e as Error).message}`,
      "trade_outcomes table missing or unreadable — boot migrations should have created it; check server logs.");
  }
};

/* ---------- 12. trailing-stop module ---------- */

const checkTrailing: CheckFn = async () => {
  const id = "trailing";
  const name = "Trailing-stop module";
  try {
    const s = trailingStatus();
    if (!s.running) {
      return fail(id, name, "Trailing loop is NOT running — no protective exits are being managed",
        "Boot the server with NODE_ENV=production node dist/boot.js — ensureTrailingLoop() only starts in the production block.");
    }
    if (!s.marketHours) {
      return ok(id, name, `Trailing loop running (sleeps off-hours by design — positions rest on their flat stops) · ${s.firedToday} fire(s) today`);
    }
    const stale = s.lastTickAt === null || Date.now() - s.lastTickAt > 30_000;
    if (stale) {
      return fail(id, name, "Trailing loop started but has not ticked in >30s during market hours — protective exits may be stalled",
        "Check server logs for tick errors (DB connectivity or market-data service). Restart the production process if ticks do not resume.");
    }
    return ok(id, name, `Managing ${s.managed} open position(s) · ${s.inFlight} exit order(s) in flight · ${s.firedToday} fire(s) today`);
  } catch (e) {
    return fail(id, name, `Trailing module error: ${(e as Error).message}`,
      "Import or evaluation failure in api/engine/trailing.ts — check server logs.");
  }
};

/* ---------- registry ---------- */

export const CHECKS: { fn: CheckFn }[] = [
  { fn: checkEnvironment },
  { fn: checkDatabase },
  { fn: checkGovernance },
  { fn: checkMarketData },
  { fn: checkEngineConfigs },
  { fn: checkSignals },
  { fn: checkAutonomous },
  { fn: checkTicketGate },
  { fn: checkIntelligence },
  { fn: checkMemory },
  { fn: checkLearning },
  { fn: checkTrailing },
];

export async function runAllChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const { fn } of CHECKS) {
    try {
      results.push(await fn());
    } catch (e) {
      results.push({ id: "unknown", name: fn.name, status: "FAIL", detail: `check crashed: ${(e as Error).message}`, remediation: "Inspect the systemcheck module — a probe itself threw." });
    }
  }
  return results;
}
