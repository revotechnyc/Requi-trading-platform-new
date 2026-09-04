import { getDb } from "../queries/connection";
import { alerts } from "@db/schema";
import { eq } from "drizzle-orm";
import { listWatchlistSymbols } from "./watchlist";
import { fetchEarnings } from "./providers/earnings";
import { fetchEdgarFilings } from "./providers/edgar";
import { fetchNews } from "./providers/news";

function todayEt(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export async function runEarningsAlertsForUser(userId: string): Promise<number> {
  const symbols = await listWatchlistSymbols(userId);
  if (!symbols.length) return 0;
  const db = getDb();
  let created = 0;
  const today = todayEt();

  for (const symbol of symbols) {
    const earnings = await fetchEarnings(symbol);
    const reportDate = earnings.payload?.reportDate;
    if (!reportDate || !reportDate.startsWith(today)) continue;

    const dedupeKey = `earnings:${symbol}:${today}`;
    const existing = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.dedupeKey, dedupeKey))
      .limit(1);
    if (existing[0]) continue;

    const filings = await fetchEdgarFilings(symbol);
    const news = await fetchNews(symbol);
    const ep = earnings.payload;
    const lines: string[] = [
      `**${symbol} earnings report today**`,
      ep?.reportTime && ep.reportTime !== "unknown" ? `**Timing:** ${ep.reportTime}` : "",
      "",
      ep
        ? `1. **How did earnings do?** EPS actual: ${ep.epsActual ?? "n/a"} · Revenue actual: ${ep.revenueActual ?? "n/a"}`
        : "1. **How did earnings do?** Data unavailable from calendar source.",
      ep
        ? `2. **Surprise:** ${ep.surprise.toUpperCase()}${ep.epsEstimate !== null ? ` (estimate ${ep.epsEstimate})` : ""}`
        : "2. **Surprise:** Unknown — consensus data missing.",
      ep?.dateType ? `3. **Date type:** ${ep.dateType}` : "",
      ep?.note ? `4. **Note:** ${ep.note}` : "",
      filings.available ? `Recent filing: ${filings.payload?.[0]?.form ?? ""} (${filings.payload?.[0]?.filedAt ?? ""})` : "",
      news.available ? `Headline: ${news.payload?.headlines?.[0]?.title ?? ""}` : "",
    ].filter(Boolean);

    await db.insert(alerts).values({
      userId,
      type: "EARNINGS",
      priority: "HIGH",
      title: `${symbol} earnings alert`,
      body: lines.join("\n"),
      symbol,
      state: "ACTIVE",
      dedupeKey,
    });
    created++;
  }
  return created;
}
