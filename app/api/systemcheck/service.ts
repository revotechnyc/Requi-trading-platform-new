import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { users, alerts, systemCheckReports } from "@db/schema";
import { etParts } from "../marketdata/indicators";
import { runAllChecks, type CheckResult } from "./checks";

/**
 * SYSTEM CHECK SERVICE — the platform's immune system.
 *
 * Runs the full component probe suite on a schedule (before market open,
 * after market close, ET, Mon–Fri) and on demand from the owner console.
 *
 *   1. PROBE — 11 real component checks (environment, database, governance,
 *      data feed, engine configs, signals self-test, autonomous monitors,
 *      ticket gate, intelligence, memory, learning).
 *   2. DIAGNOSE — when anything is degraded, the AI receives the failures
 *      and returns: what's broken, likely cause, exact fix steps, and one
 *      systemic improvement per failure — plus a short GROWTH section on
 *      making the platform better. On the daily post-close run it adds
 *      growth suggestions even when all checks pass.
 *   3. REPORT — every run persists to system_check_reports (owner console
 *      history) and pushes an in-app notification to all admin users via
 *      the alerts table (NotificationCenter polls it — no new UI plumbing).
 *
 * BOUNDARY: this module OBSERVES and ADVISES. The only automatic action it
 * ever takes is restarting the market-data refresh loop when it should be
 * running — everything else arrives as a recommendation for a human.
 */

export type SystemCheckTrigger = "PRE_OPEN" | "POST_CLOSE" | "MANUAL";

export interface StoredReport {
  id: string;
  triggerType: string;
  overall: string;
  okCount: number;
  warnCount: number;
  failCount: number;
  checks: CheckResult[];
  aiDiagnosis: string | null;
  createdAt: Date;
}

/* ---------- AI diagnosis ---------- */

async function diagnoseWithAi(results: CheckResult[], includeGrowth: boolean): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const issues = results.filter((r) => r.status !== "OK");
  if (issues.length === 0 && !includeGrowth) return null;

  const issueText = issues.length > 0
    ? issues.map((r) => `[${r.status}] ${r.name}: ${r.detail}${r.remediation ? ` (hint: ${r.remediation})` : ""}`).join("\n")
    : "All 11 component checks passed — no failures this run.";

  const system = [
    "You are the chief reliability engineer of Requi Trading, an autonomous trading SaaS.",
    "Architecture: React/tRPC frontend; Hono server; Drizzle + MySQL; a deterministic strategy engine (trigger library, setup state machine, backtester, simulator, scanner); a signed governance package that clamps all risk config; an order-ticket confirmation gate (nothing reaches a broker without a human CONFIRM); IBKR Client Portal market data; an LLM intelligence layer with tool access; conversation memory; and a learning loop over logged trade outcomes.",
    "You receive system health-check results. Respond in plain text, concise and technical, with these sections:",
    "BROKEN: for each FAIL/WARN — what is broken, the most likely cause, and the exact fix (env vars, restart steps, file to inspect).",
    "PREVENT: one systemic improvement per failure class so it cannot recur silently.",
    "GROWTH: 2-3 concrete suggestions to make the whole platform better this week (reliability, observability, or trading quality).",
    "Never suggest loosening risk limits, bypassing governance, or auto-executing without confirmation. If you suggest it, it must keep those invariants.",
  ].join("\n");

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-5.6",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Health check results (${new Date().toISOString()}):\n${issueText}` },
        ],
        max_tokens: 1400,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/* ---------- notifications (in-app, via the alerts table) ---------- */

async function notifyAdmins(overall: string, results: CheckResult[], diagnosis: string | null, trigger: SystemCheckTrigger) {
  const db = getDb();
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
  if (admins.length === 0) return;

  const issues = results.filter((r) => r.status !== "OK");
  const fails = issues.filter((r) => r.status === "FAIL");
  const triggerLabel = trigger === "PRE_OPEN" ? "pre-open" : trigger === "POST_CLOSE" ? "post-close" : "manual";

  // Noise policy: WARN/FAIL always notify; a clean run only notifies on the
  // daily post-close (a once-a-day "all clear"), never on pre-open/manual spam.
  const shouldNotify = overall !== "OK" || trigger === "POST_CLOSE";
  if (!shouldNotify) return;

  const title =
    overall === "FAIL"
      ? `System Check FAILED — ${fails.length} component(s) down`
      : overall === "WARN"
        ? `System Check: ${issues.length} warning(s) detected`
        : "System Check: all clear";

  const bodyLines = [
    `${triggerLabel} run · ${results.filter((r) => r.status === "OK").length} OK · ${issues.filter((r) => r.status === "WARN").length} WARN · ${fails.length} FAIL`,
    ...issues.slice(0, 5).map((r) => `${r.status} — ${r.name}: ${r.detail}`),
  ];
  if (diagnosis) bodyLines.push("", "AI diagnosis:", diagnosis.slice(0, 900));
  else if (overall !== "OK") bodyLines.push("", "(AI diagnosis unavailable — OPENAI_API_KEY missing or model error; see owner System Check page for check details.)");

  for (const a of admins) {
    await db.insert(alerts).values({
      userId: a.id,
      type: "SYSTEM_STATE",
      priority: overall === "FAIL" ? "CRITICAL" : overall === "WARN" ? "HIGH" : "LOW",
      title,
      body: bodyLines.join("\n").slice(0, 2000),
      state: overall === "OK" ? "WATCHING" : "ACTION_REQUIRED",
    });
  }
}

/* ---------- runner ---------- */

let running = false;

export async function runSystemCheck(trigger: SystemCheckTrigger): Promise<StoredReport> {
  if (running) {
    const latest = await getLatestReport();
    if (latest) return latest;
  }
  running = true;
  try {
    const results = await runAllChecks();
    const failCount = results.filter((r) => r.status === "FAIL").length;
    const warnCount = results.filter((r) => r.status === "WARN").length;
    const okCount = results.length - failCount - warnCount;
    const overall = failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "OK";

    // AI diagnosis: on issues always; on the daily post-close even when clean (growth suggestions).
    const diagnosis = await diagnoseWithAi(results, trigger === "POST_CLOSE");

    const db = getDb();
    const [inserted] = await db
      .insert(systemCheckReports)
      .values({
        triggerType: trigger,
        overall,
        okCount,
        warnCount,
        failCount,
        checksJson: JSON.stringify(results),
        aiDiagnosis: diagnosis,
      })
      .returning();

    await notifyAdmins(overall, results, diagnosis, trigger).catch(() => undefined);

    return {
      id: inserted?.id ?? "",
      triggerType: trigger,
      overall,
      okCount,
      warnCount,
      failCount,
      checks: results,
      aiDiagnosis: diagnosis,
      createdAt: new Date(),
    };
  } finally {
    running = false;
  }
}

/* ---------- history ---------- */

function toStored(row: typeof systemCheckReports.$inferSelect): StoredReport {
  let checks: CheckResult[] = [];
  try {
    checks = JSON.parse(row.checksJson) as CheckResult[];
  } catch {
    checks = [];
  }
  return {
    id: row.id,
    triggerType: row.triggerType,
    overall: row.overall,
    okCount: row.okCount,
    warnCount: row.warnCount,
    failCount: row.failCount,
    checks,
    aiDiagnosis: row.aiDiagnosis ?? null,
    createdAt: row.createdAt,
  };
}

export async function getLatestReport(): Promise<StoredReport | null> {
  const db = getDb();
  const rows = await db.select().from(systemCheckReports).orderBy(desc(systemCheckReports.id)).limit(1);
  return rows.length > 0 ? toStored(rows[0]) : null;
}

export async function listReports(limit = 20): Promise<StoredReport[]> {
  const db = getDb();
  const rows = await db.select().from(systemCheckReports).orderBy(desc(systemCheckReports.id)).limit(Math.min(limit, 50));
  return rows.map(toStored);
}

/* ---------- scheduler: pre-open 09:00 ET, post-close 16:15 ET, Mon–Fri ---------- */

const PRE_OPEN_MIN = 9 * 60; // 09:00 ET, window 09:00–09:25
const POST_CLOSE_MIN = 16 * 60 + 15; // 16:15 ET, window 16:15–16:40
const WINDOW = 25;

let schedulerTimer: NodeJS.Timeout | null = null;
const ranSlots = new Set<string>();

function etWeekday(now: number): number {
  return new Date(new Date(now).toLocaleString("en-US", { timeZone: "America/New_York" })).getDay();
}

async function schedulerTick() {
  const now = Date.now();
  const dow = etWeekday(now);
  if (dow === 0 || dow === 6) return;
  const { day, minutes } = etParts(now);

  if (minutes >= PRE_OPEN_MIN && minutes < PRE_OPEN_MIN + WINDOW && !ranSlots.has(`${day}:PRE_OPEN`)) {
    ranSlots.add(`${day}:PRE_OPEN`);
    await runSystemCheck("PRE_OPEN").catch(() => ranSlots.delete(`${day}:PRE_OPEN`));
  }
  if (minutes >= POST_CLOSE_MIN && minutes < POST_CLOSE_MIN + WINDOW && !ranSlots.has(`${day}:POST_CLOSE`)) {
    ranSlots.add(`${day}:POST_CLOSE`);
    await runSystemCheck("POST_CLOSE").catch(() => ranSlots.delete(`${day}:POST_CLOSE`));
  }
  // bound the latch set (keep today + yesterday only)
  if (ranSlots.size > 6) {
    const keep = [...ranSlots].slice(-4);
    ranSlots.clear();
    for (const k of keep) ranSlots.add(k);
  }
}

export function ensureSystemCheckLoop(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    schedulerTick().catch(() => undefined);
  }, 60_000);
  schedulerTimer.unref();
}

export function systemCheckLoopStatus(): { running: boolean; ranToday: string[] } {
  return { running: schedulerTimer !== null, ranToday: [...ranSlots] };
}
