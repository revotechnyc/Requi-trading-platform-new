/**
 * Day-based earnings calendar (Finnhub bulk calendar — no symbol required).
 * Powers queries like "what is Tuesday quarterly earnings".
 */
import { fetchWithRetry } from "./http";
import { intelligenceCache, LAYER_TTL_MS } from "./cache";

const UA = "Mozilla/5.0 (compatible; RequiTrading/1.0)";
const ET = "America/New_York";
const MAX_ROWS_IN_REPLY = 40;

export type EarningsDayRow = {
  symbol: string;
  date: string;
  reportTime: "BMO" | "AMC" | "DMH" | "unknown";
  epsEstimate: number | null;
  epsActual: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
  quarter: number | null;
  year: number | null;
};

export type EarningsDayCalendarResult = {
  available: boolean;
  date: string;
  dateLabel: string;
  source: string;
  timestamp: string;
  rows: EarningsDayRow[];
  totalCount: number;
  truncated: boolean;
  error?: string;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function etParts(d: Date = new Date()): { y: number; m: number; day: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function ymdFromEtParts(p: { y: number; m: number; day: number }): string {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Add calendar days in ET by reconstructing noon UTC-ish via Date.UTC offset approximation. */
function addEtDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  // Use UTC noon + shift so DST edge cases rarely flip the ET calendar date.
  const base = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  base.setUTCDate(base.getUTCDate() + delta);
  return ymdFromEtParts(etParts(base));
}

function formatDateLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const approx = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(approx);
}

/**
 * Resolve natural-language day references to an ET YYYY-MM-DD.
 * Returns null when the text is not a day-calendar style earnings query.
 */
export function resolveEarningsCalendarDate(text: string): string | null {
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();
  // Accept common misspelling "quaterly" from client test prompts.
  if (!/\bearnings?\b|\bquart?erly\b|\breport(?:s|ing)?\b|\bcalendar\b/i.test(lower)) {
    return null;
  }

  // Explicit ISO date wins.
  const iso = lower.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const today = ymdFromEtParts(etParts());

  if (/\btoday\b/.test(lower)) return today;
  if (/\btomorrow\b/.test(lower)) return addEtDays(today, 1);

  // "this week" → use today as the board day (caller may expand later).
  if (/\bthis week\b/.test(lower) && !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)) {
    return today;
  }

  for (const [name, targetDow] of Object.entries(WEEKDAY_INDEX)) {
    if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
    const { weekday } = etParts();
    let delta = (targetDow - weekday + 7) % 7;
    // "next Tuesday" → always the following week if today is Tuesday, else upcoming.
    if (/\bnext\b/.test(lower) && delta === 0) delta = 7;
    return addEtDays(today, delta);
  }

  // "earnings calendar" / "who reports earnings" without a day → today.
  if (
    /\bearnings?\s+calendar\b/.test(lower) ||
    /\bwho\s+reports?\b/.test(lower) ||
    /\bcompanies?\s+(?:that\s+)?report\b/.test(lower) ||
    /\bquart?erly\s+earnings\b/.test(lower)
  ) {
    return today;
  }

  return null;
}

/** True when the user wants a day board, not a single-ticker next-earnings answer. */
export function isEarningsDayCalendarQuery(text: string): boolean {
  const lower = text.toLowerCase();
  if (!/\bearnings?\b|\bquart?erly\b|\breport(?:s|ing)?\b|\bcalendar\b/i.test(lower)) return false;

  // Single-ticker "when is Apple's next earnings" should stay on the per-symbol path.
  if (/\b(when\s+is|when\s+does|next\s+earnings|earnings\s+date)\b/i.test(lower)) {
    // Still allow day boards like "when are Tuesday earnings"
    if (!/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|this week|calendar)\b/i.test(lower)) {
      return false;
    }
  }

  return resolveEarningsCalendarDate(text) !== null;
}

function mapHour(hour: string | undefined | null): EarningsDayRow["reportTime"] {
  const h = (hour ?? "").toLowerCase();
  if (h === "bmo" || h === "amc" || h === "dmh") return h.toUpperCase() as EarningsDayRow["reportTime"];
  return "unknown";
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function finnhubEarningsForDate(ymd: string): Promise<EarningsDayRow[]> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) {
    throw new Error("FINNHUB_API_KEY not configured");
  }
  const url =
    `https://finnhub.io/api/v1/calendar/earnings?from=${ymd}&to=${ymd}&token=${key}`;
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  if (!res.ok) {
    throw new Error(`Finnhub earnings calendar HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    earningsCalendar?: Array<{
      date?: string;
      epsActual?: number | null;
      epsEstimate?: number | null;
      hour?: string | null;
      quarter?: number | null;
      revenueActual?: number | null;
      revenueEstimate?: number | null;
      symbol?: string;
      year?: number | null;
    }>;
  };
  const rows: EarningsDayRow[] = [];
  for (const row of data.earningsCalendar ?? []) {
    const symbol = row.symbol?.trim().toUpperCase();
    if (!symbol) continue;
    rows.push({
      symbol,
      date: row.date ?? ymd,
      reportTime: mapHour(row.hour),
      epsEstimate: numOrNull(row.epsEstimate),
      epsActual: numOrNull(row.epsActual),
      revenueEstimate: numOrNull(row.revenueEstimate),
      revenueActual: numOrNull(row.revenueActual),
      quarter: typeof row.quarter === "number" ? row.quarter : null,
      year: typeof row.year === "number" ? row.year : null,
    });
  }
  rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return rows;
}

export async function fetchEarningsCalendarForDate(ymd: string): Promise<EarningsDayCalendarResult> {
  const timestamp = new Date().toISOString();
  const dateLabel = formatDateLabel(ymd);
  try {
    const rows = await intelligenceCache.through(
      `earnings-day:${ymd}:v1`,
      LAYER_TTL_MS.earnings,
      () => finnhubEarningsForDate(ymd),
    );
    const truncated = rows.length > MAX_ROWS_IN_REPLY;
    return {
      available: true,
      date: ymd,
      dateLabel,
      source: "Finnhub",
      timestamp,
      rows: rows.slice(0, MAX_ROWS_IN_REPLY),
      totalCount: rows.length,
      truncated,
    };
  } catch (e) {
    return {
      available: false,
      date: ymd,
      dateLabel,
      source: "Finnhub",
      timestamp,
      rows: [],
      totalCount: 0,
      truncated: false,
      error: (e as Error).message,
    };
  }
}

function fmtEps(v: number | null): string {
  return v === null ? "—" : v.toFixed(2);
}

function fmtRev(v: number | null): string {
  if (v === null) return "—";
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return String(Math.round(v));
}

export function formatEarningsDayCalendarReply(result: EarningsDayCalendarResult): string {
  if (!result.available) {
    return [
      `**US quarterly earnings calendar — ${result.dateLabel}**`,
      "",
      `**Unavailable** from the earnings calendar source.`,
      `- **Date (ET):** ${result.date}`,
      `- **Source:** ${result.source}`,
      `- **Reason:** ${result.error ?? "calendar fetch failed"}`,
      `- **As of:** ${result.timestamp}`,
      "",
      "I won't invent a list of reporting companies. Configure or restore Finnhub calendar access and retry.",
    ].join("\n");
  }

  if (!result.totalCount) {
    return [
      `**US quarterly earnings — ${result.dateLabel} (ET)**`,
      "",
      `No companies appear on the Finnhub earnings calendar for **${result.date}**.`,
      `- **Source:** ${result.source}`,
      `- **As of:** ${result.timestamp}`,
      "",
      "This is a verified empty calendar day — not an estimate.",
    ].join("\n");
  }

  const lines = [
    `**US quarterly earnings — ${result.dateLabel} (ET)**`,
    "",
    `- **Source:** ${result.source} (confirmed calendar)`,
    `- **As of:** ${result.timestamp}`,
    `- **Companies on calendar:** ${result.totalCount}${result.truncated ? ` (showing first ${result.rows.length})` : ""}`,
    "",
    "| Symbol | Timing | EPS est | Rev est |",
    "|--------|--------|---------|---------|",
  ];

  for (const row of result.rows) {
    const timing = row.reportTime === "unknown" ? "—" : row.reportTime;
    lines.push(
      `| ${row.symbol} | ${timing} | ${fmtEps(row.epsEstimate)} | ${fmtRev(row.revenueEstimate)} |`,
    );
  }

  lines.push(
    "",
    "Timing: **BMO** = before open, **AMC** = after close, **DMH** = during market hours.",
    "I won't invent companies beyond this Finnhub calendar list.",
  );
  if (result.truncated) {
    lines.push(`List truncated at ${MAX_ROWS_IN_REPLY} symbols — ask for a specific ticker for full detail.`);
  }
  return lines.join("\n");
}

export async function tryEarningsDayCalendarReply(
  text: string,
): Promise<{ reply: string; meta: { symbols: string[]; source: string | null; sourceName: string | null; stale: boolean; timestamp: string | null } } | null> {
  if (!isEarningsDayCalendarQuery(text)) return null;
  const ymd = resolveEarningsCalendarDate(text);
  if (!ymd) return null;
  const result = await fetchEarningsCalendarForDate(ymd);
  return {
    reply: formatEarningsDayCalendarReply(result),
    meta: {
      symbols: result.rows.slice(0, 8).map((r) => r.symbol),
      source: result.available ? "finnhub" : null,
      sourceName: result.available ? "Finnhub" : "Finnhub (unavailable)",
      stale: false,
      timestamp: result.timestamp,
    },
  };
}
