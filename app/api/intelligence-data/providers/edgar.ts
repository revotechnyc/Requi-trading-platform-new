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
    const filings = await intelligenceCache.through(`edgar:${sym}`, LAYER_TTL_MS.edgar, async () => {
      const map = await loadTickerCikMap();
      const cik = map.get(sym);
      if (!cik) throw new Error(`No CIK for ${sym}`);

      const res = await fetchWithRetry(`https://data.sec.gov/submissions/CIK${cik}.json`, {
        headers: { "User-Agent": SEC_UA, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`EDGAR submissions HTTP ${res.status}`);
      const body = (await res.json()) as {
        name?: string;
        filings?: { recent?: { form?: string[]; filingDate?: string[]; primaryDocDescription?: string[]; accessionNumber?: string[] } };
      };
      const recent = body.filings?.recent;
      if (!recent?.form?.length) return [] as FilingPayload[];

      const out: FilingPayload[] = [];
      for (let i = 0; i < Math.min(recent.form.length, 12); i++) {
        const form = recent.form[i];
        if (!form || !/^(10-K|10-Q|8-K|4)/i.test(form)) continue;
        const acc = recent.accessionNumber?.[i]?.replace(/-/g, "");
        const url = acc
          ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc}/${acc}-index.html`
          : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${form}`;
        out.push({
          form,
          filedAt: recent.filingDate?.[i] ?? "",
          title: recent.primaryDocDescription?.[i] ?? `${form} filing`,
          url,
        });
        if (out.length >= 6) break;
      }
      return out;
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
