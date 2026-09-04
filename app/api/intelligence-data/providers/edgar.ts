import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import type { FilingPayload, LayerEnvelope } from "../types";

const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "Requi Trading requi@requitrading.com";

let tickerCikMap: Map<string, string> | null = null;

async function loadTickerCikMap(): Promise<Map<string, string>> {
  if (tickerCikMap) return tickerCikMap;
  return intelligenceCache.through("edgar:ticker_map", 24 * 3_600_000, async () => {
    const res = await fetchWithRetry("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": SEC_UA, Accept: "application/json" },
      retries: 3,
      backoffMs: 600,
      timeoutMs: 25_000,
    });
    if (!res.ok) throw new Error(`SEC ticker map HTTP ${res.status}`);
    const data = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    const map = new Map<string, string>();
    for (const row of Object.values(data)) {
      map.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
    }
    tickerCikMap = map;
    return map;
  });
}

export async function fetchEdgarFilings(symbol: string): Promise<LayerEnvelope<FilingPayload[]>> {
  const sym = symbol.toUpperCase();
  const now = new Date().toISOString();
  try {
    // Provider version bump: avoids stale in-process cache entries after logic changes.
    const filings = await intelligenceCache.through(`edgar:${sym}:v2`, LAYER_TTL_MS.edgar, async () => {
      const map = await loadTickerCikMap();
      const cik = map.get(sym);
      if (!cik) throw new Error(`No CIK for ${sym}`);

      const res = await fetchWithRetry(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": SEC_UA, Accept: "application/json" },
        retries: 3,
        backoffMs: 600,
        timeoutMs: 25_000,
      });
      if (!res.ok) throw new Error(`EDGAR submissions HTTP ${res.status}`);
      const body = (await res.json()) as {
        name?: string;
        filings?: { recent?: { form?: string[]; filingDate?: string[]; primaryDocDescription?: string[]; accessionNumber?: string[] } };
      };
      const recent = body.filings?.recent;
      if (!recent?.form?.length) return [] as FilingPayload[];

      // The SEC "recent" arrays can be dominated by Form 4. We still need to
      // include the *latest* 10-K / 10-Q / 8-K so query-specific answers
      // (Test 4) can be verified.
      //
      // recent.* is already in descending recency order.
      const latestByType: Partial<Record<"10-K" | "10-Q" | "8-K", FilingPayload>> = {};
      const form4: FilingPayload[] = [];

      const wantedForms = new Set<"10-K" | "10-Q" | "8-K">(["10-K", "10-Q", "8-K"]);
      const maxForm4 = 8;

      for (let i = 0; i < recent.form.length; i++) {
        const formRaw = recent.form[i];
        if (!formRaw) continue;
        const form = formRaw.toUpperCase();
        if (!/^(10-K|10-Q|8-K|4)/i.test(form)) continue;

        // Normalize variants like "10-K/A" → "10-K" key buckets.
        const formType: "10-K" | "10-Q" | "8-K" | "4" | null =
          form.startsWith("10-K") ? "10-K" :
          form.startsWith("10-Q") ? "10-Q" :
          form.startsWith("8-K") ? "8-K" :
          /^4/i.test(form) ? "4" :
          null;
        if (!formType) continue;

        const acc = recent.accessionNumber?.[i]?.replace(/-/g, "");
        const url = acc
          ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${acc}-index.html`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form}`;

        const payload: FilingPayload = {
          form: formRaw,
          filedAt: recent.filingDate?.[i] ?? "",
          title: recent.primaryDocDescription?.[i] ?? `${formRaw} filing`,
          url,
        };

        if (wantedForms.has(formType as "10-K" | "10-Q" | "8-K")) {
          const key = formType as "10-K" | "10-Q" | "8-K";
          if (!latestByType[key]) latestByType[key] = payload;
        } else if (formType === "4") {
          if (form4.length < maxForm4) form4.push(payload);
        }

        // Stop early once we have the key types + enough form4 context.
        const hasAllWanted = wantedForms.size === Object.keys(latestByType).length;
        if (hasAllWanted && form4.length >= 3) break;
      }

      const out: FilingPayload[] = [];
      // Push key filings first (in a stable order).
      for (const k of ["10-K", "10-Q", "8-K"] as const) {
        const row = latestByType[k];
        if (row) out.push(row);
      }
      // Then add form 4 context.
      out.push(...form4);
      return out.slice(0, 12);
    });

    return {
      layer: "edgar",
      ticker: sym,
      timestamp: now,
      source: "SEC EDGAR",
      available: filings.length > 0,
      stale: false,
      payload: filings,
    };
  } catch (e) {
    return {
      layer: "edgar",
      ticker: sym,
      timestamp: now,
      source: "SEC EDGAR",
      available: false,
      stale: false,
      payload: null,
      error: (e as Error).message,
    };
  }
}
