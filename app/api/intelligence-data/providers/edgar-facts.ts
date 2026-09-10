/**
 * SEC companyfacts (XBRL) — official filed financial facts.
 * Free; requires SEC_EDGAR_USER_AGENT only.
 * SEC data outranks aggregator numbers for filed facts.
 */
import { fetchWithRetry } from "../http";
import { intelligenceCache, LAYER_TTL_MS } from "../cache";

const SEC_UA =
  process.env.SEC_EDGAR_USER_AGENT?.trim() ||
  "Requi Trading requi@requitrading.com";

export type SecFactPoint = {
  concept: string;
  label: string;
  value: number | null;
  unit: string | null;
  end: string | null;
  filed: string | null;
  form: string | null;
};

export type SecCompanyFactsSummary = {
  available: boolean;
  symbol: string;
  cik: string | null;
  facts: SecFactPoint[];
  derived: {
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    currentRatio: number | null;
    netCash: number | null;
    freeCashFlow: number | null;
  };
  source: string;
  error?: string;
};

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

type FactNode = {
  label?: string;
  units?: Record<string, Array<{ val?: number; end?: string; filed?: string; form?: string }>>;
};

function latestUsdFact(node: FactNode | undefined, concept: string): SecFactPoint | null {
  if (!node?.units) return null;
  const usd = node.units.USD ?? node.units.usd ?? Object.values(node.units)[0];
  if (!usd?.length) return null;
  // Prefer 10-K / 10-Q, newest end date.
  const ranked = [...usd].sort((a, b) => {
    const ae = a.end ?? "";
    const be = b.end ?? "";
    if (ae !== be) return be.localeCompare(ae);
    return (b.filed ?? "").localeCompare(a.filed ?? "");
  });
  const pick =
    ranked.find((r) => /10-K|10-Q/i.test(r.form ?? "")) ??
    ranked[0];
  if (!pick || typeof pick.val !== "number") return null;
  const unitKey = node.units.USD ? "USD" : Object.keys(node.units)[0] ?? null;
  return {
    concept,
    label: node.label ?? concept,
    value: pick.val,
    unit: unitKey,
    end: pick.end ?? null,
    filed: pick.filed ?? null,
    form: pick.form ?? null,
  };
}

const CONCEPTS: Array<{ key: string; aliases: string[] }> = [
  { key: "Revenue", aliases: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"] },
  { key: "GrossProfit", aliases: ["GrossProfit"] },
  { key: "OperatingIncome", aliases: ["OperatingIncomeLoss"] },
  { key: "NetIncome", aliases: ["NetIncomeLoss"] },
  { key: "Cash", aliases: ["CashAndCashEquivalentsAtCarryingValue", "Cash"] },
  { key: "CurrentAssets", aliases: ["AssetsCurrent"] },
  { key: "CurrentLiabilities", aliases: ["LiabilitiesCurrent"] },
  { key: "LongTermDebt", aliases: ["LongTermDebt", "LongTermDebtNoncurrent"] },
  { key: "OperatingCashFlow", aliases: ["NetCashProvidedByUsedInOperatingActivities"] },
  { key: "Capex", aliases: ["PaymentsToAcquirePropertyPlantAndEquipment"] },
];

function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || Math.abs(den) < 1e-9) return null;
  return num / den;
}

export async function fetchSecCompanyFacts(symbol: string): Promise<SecCompanyFactsSummary> {
  const sym = symbol.toUpperCase();
  const emptyDerived = {
    grossMargin: null,
    operatingMargin: null,
    netMargin: null,
    currentRatio: null,
    netCash: null,
    freeCashFlow: null,
  };
  try {
    const summary = await intelligenceCache.through(
      `edgar:facts:${sym}:v1`,
      LAYER_TTL_MS.edgar,
      async () => {
        const map = await loadTickerCikMap();
        const cik = map.get(sym);
        if (!cik) throw new Error(`No CIK for ${sym}`);

        const res = await fetchWithRetry(
          `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
          {
            headers: { "User-Agent": SEC_UA, Accept: "application/json" },
            retries: 3,
            backoffMs: 700,
            timeoutMs: 30_000,
          },
        );
        if (!res.ok) throw new Error(`SEC companyfacts HTTP ${res.status}`);
        const body = (await res.json()) as {
          facts?: { "us-gaap"?: Record<string, FactNode> };
        };
        const gaap = body.facts?.["us-gaap"] ?? {};
        const facts: SecFactPoint[] = [];
        const byKey: Record<string, number | null> = {};

        for (const c of CONCEPTS) {
          let found: SecFactPoint | null = null;
          for (const alias of c.aliases) {
            found = latestUsdFact(gaap[alias], alias);
            if (found) break;
          }
          if (found) {
            facts.push(found);
            byKey[c.key] = found.value;
          } else {
            byKey[c.key] = null;
          }
        }

        const revenue = byKey.Revenue ?? null;
        const gross = byKey.GrossProfit ?? null;
        const opInc = byKey.OperatingIncome ?? null;
        const netInc = byKey.NetIncome ?? null;
        const cash = byKey.Cash ?? null;
        const ca = byKey.CurrentAssets ?? null;
        const cl = byKey.CurrentLiabilities ?? null;
        const debt = byKey.LongTermDebt ?? null;
        const ocf = byKey.OperatingCashFlow ?? null;
        const capex = byKey.Capex ?? null;

        return {
          available: facts.length > 0,
          symbol: sym,
          cik,
          facts,
          derived: {
            grossMargin: ratio(gross, revenue),
            operatingMargin: ratio(opInc, revenue),
            netMargin: ratio(netInc, revenue),
            currentRatio: ratio(ca, cl),
            netCash: cash !== null && debt !== null ? cash - debt : cash,
            freeCashFlow: ocf !== null && capex !== null ? ocf - Math.abs(capex) : null,
          },
          source: "SEC companyfacts (XBRL)",
        } satisfies SecCompanyFactsSummary;
      },
    );
    return summary;
  } catch (e) {
    return {
      available: false,
      symbol: sym,
      cik: null,
      facts: [],
      derived: emptyDerived,
      source: "SEC companyfacts (XBRL)",
      error: (e as Error).message,
    };
  }
}
