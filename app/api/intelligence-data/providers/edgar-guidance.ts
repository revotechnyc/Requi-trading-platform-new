/**
 * SEC 8-K guidance / KPI extract — regex first; numbers must appear in source text.
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";
import { researchOk, researchUnavailable, type ResearchFetchBase } from "./types-research";

const UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "Requi Trading Intelligence requi@requitrading.com";

export type GuidanceExtractResult = ResearchFetchBase & {
  symbol: string;
  cik: string | null;
  guidanceSnippets: string[];
  kpiSnippets: string[];
  raisesOrMaintains: boolean | null;
};

const GUIDANCE_RE =
  /\b(?:expects?|outlook|guidance|forecast)\b[^.]{0,160}(?:\$[\d,.]+|\d+(?:\.\d+)?\s*%|\d+\s*(?:million|billion))/gi;
const KPI_RE =
  /\b(?:ARR|MRR|active\s+users|subscribers?|backlog|bookings?|same[-\s]?store)\b[^.]{0,120}/gi;

/** Ensure extracted snippets are substrings of source (anti-invent). */
export function validateExtractAgainstSource(snippet: string, source: string): boolean {
  const normalizedSnippet = snippet.replace(/\s+/g, " ").trim();
  const normalizedSource = source.replace(/\s+/g, " ");
  if (normalizedSource.includes(normalizedSnippet)) return true;
  // Allow soft whitespace drift: require a long contiguous chunk
  const chunk = normalizedSnippet.slice(0, Math.min(48, normalizedSnippet.length));
  return chunk.length >= 12 && normalizedSource.includes(chunk);
}

export function extractGuidanceFromText(text: string): {
  guidanceSnippets: string[];
  kpiSnippets: string[];
  raisesOrMaintains: boolean | null;
} {
  const guidanceSnippets: string[] = [];
  const kpiSnippets: string[] = [];
  for (const m of text.matchAll(GUIDANCE_RE)) {
    const s = m[0]!.replace(/\s+/g, " ").trim();
    if (s.length < 20) continue;
    if (!validateExtractAgainstSource(s, text)) continue;
    if (!guidanceSnippets.includes(s)) guidanceSnippets.push(s);
    if (guidanceSnippets.length >= 5) break;
  }
  for (const m of text.matchAll(KPI_RE)) {
    const s = m[0]!.replace(/\s+/g, " ").trim();
    if (s.length < 8) continue;
    if (!validateExtractAgainstSource(s, text)) continue;
    if (!kpiSnippets.includes(s)) kpiSnippets.push(s);
    if (kpiSnippets.length >= 5) break;
  }
  let raisesOrMaintains: boolean | null = null;
  if (/\b(raises?|increases?|above)\b.*\bguidance\b|\bguidance\b.*\b(raised|increased)\b/i.test(text)) {
    raisesOrMaintains = true;
  } else if (/\b(lowers?|cuts?|withdraws?|suspends?)\b.*\bguidance\b/i.test(text)) {
    raisesOrMaintains = false;
  } else if (guidanceSnippets.length) {
    raisesOrMaintains = null;
  }
  return { guidanceSnippets, kpiSnippets, raisesOrMaintains };
}

async function resolveCik(symbol: string): Promise<string | null> {
  try {
    const url = "https://www.sec.gov/files/company_tickers.json";
    const res = await fetchWithRetry(url, { headers: { "User-Agent": UA }, timeoutMs: 12_000 });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { ticker?: string; cik_str?: string }>;
    const sym = symbol.toUpperCase();
    for (const row of Object.values(data)) {
      if ((row.ticker ?? "").toUpperCase() === sym) {
        return String(row.cik_str ?? "").padStart(10, "0");
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Fixture path for tests — pass html directly. */
export function guidanceFromHtmlFixture(symbol: string, html: string): GuidanceExtractResult {
  const plain = html.replace(/<[^>]+>/g, " ");
  const extracted = extractGuidanceFromText(plain);
  const ok = extracted.guidanceSnippets.length > 0 || extracted.kpiSnippets.length > 0;
  if (!ok) {
    return {
      ...researchUnavailable("SEC 8-K extract", "No guidance/KPI phrases matched"),
      symbol: symbol.toUpperCase(),
      cik: null,
      guidanceSnippets: [],
      kpiSnippets: [],
      raisesOrMaintains: null,
    };
  }
  return {
    ...researchOk("SEC 8-K extract", false),
    symbol: symbol.toUpperCase(),
    cik: null,
    ...extracted,
  };
}

export async function fetchEdgarGuidance(symbol: string): Promise<GuidanceExtractResult> {
  const sym = symbol.toUpperCase();
  return intelligenceCache.through(`edgar-guidance:${sym}`, LAYER_TTL_MS.edgar, async () => {
    const cik = await resolveCik(sym);
    if (!cik) {
      return {
        ...researchUnavailable("SEC 8-K extract", "CIK not resolved for ticker"),
        symbol: sym,
        cik: null,
        guidanceSnippets: [],
        kpiSnippets: [],
        raisesOrMaintains: null,
      };
    }
    try {
      const subUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
      const subRes = await fetchWithRetry(subUrl, { headers: { "User-Agent": UA }, timeoutMs: 15_000 });
      if (!subRes.ok) {
        return {
          ...researchUnavailable("SEC 8-K extract", `submissions HTTP ${subRes.status}`),
          symbol: sym,
          cik,
          guidanceSnippets: [],
          kpiSnippets: [],
          raisesOrMaintains: null,
        };
      }
      const sub = (await subRes.json()) as {
        filings?: { recent?: { form?: string[]; accessionNumber?: string[]; primaryDocument?: string[] } };
      };
      const recent = sub.filings?.recent;
      const forms = recent?.form ?? [];
      const acc = recent?.accessionNumber ?? [];
      const docs = recent?.primaryDocument ?? [];
      let idx = forms.findIndex((f) => f === "8-K");
      if (idx < 0) {
        return {
          ...researchUnavailable("SEC 8-K extract", "No recent 8-K in submissions"),
          symbol: sym,
          cik,
          guidanceSnippets: [],
          kpiSnippets: [],
          raisesOrMaintains: null,
        };
      }
      const accession = (acc[idx] ?? "").replace(/-/g, "");
      const doc = docs[idx] ?? "";
      if (!accession || !doc) {
        return {
          ...researchUnavailable("SEC 8-K extract", "8-K accession/document missing"),
          symbol: sym,
          cik,
          guidanceSnippets: [],
          kpiSnippets: [],
          raisesOrMaintains: null,
        };
      }
      const cikNum = String(Number(cik));
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession}/${doc}`;
      const docRes = await fetchWithRetry(docUrl, { headers: { "User-Agent": UA }, timeoutMs: 20_000 });
      if (!docRes.ok) {
        return {
          ...researchUnavailable("SEC 8-K extract", `8-K document HTTP ${docRes.status}`),
          symbol: sym,
          cik,
          guidanceSnippets: [],
          kpiSnippets: [],
          raisesOrMaintains: null,
        };
      }
      const html = await docRes.text();
      return guidanceFromHtmlFixture(sym, html);
    } catch (e) {
      return {
        ...researchUnavailable("SEC 8-K extract", (e as Error).message),
        symbol: sym,
        cik,
        guidanceSnippets: [],
        kpiSnippets: [],
        raisesOrMaintains: null,
      };
    }
  });
}
