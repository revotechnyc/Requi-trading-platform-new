/**
 * Coding-only hyp-portfolio risk helpers — sector ETF proxies (no new vendors).
 * XLK / XLF / XLV + cash ballast from verified daily history via market gateway.
 */
import { getHistory } from "../marketdata/gateway/gateway";
import { returnCorrelation } from "../engine/risk";

export type SleeveKey = "technology" | "financials" | "healthcare" | "cash" | "other";

export type SleeveWeight = {
  key: SleeveKey;
  label: string;
  weightPct: number;
};

export type EtfRiskProxy = {
  key: SleeveKey;
  label: string;
  etf: string | null;
  weightPct: number;
};

export type SleeveRiskReport = {
  available: boolean;
  asOf: string;
  windowDays: number;
  proxies: EtfRiskProxy[];
  correlations: Array<{ a: string; b: string; corr: number | null }>;
  maxDrawdowns: Array<{ symbol: string; label: string; maxDrawdownPct: number | null }>;
  notes: string[];
  source: string | null;
};

const KEY_TO_ETF: Record<string, { etf: string; label: string } | null> = {
  technology: { etf: "XLK", label: "Technology (XLK)" },
  financials: { etf: "XLF", label: "Financials (XLF)" },
  healthcare: { etf: "XLV", label: "Healthcare (XLV)" },
  cash: null,
  other: null,
};

/** Max drawdown from daily closes (percent, e.g. -22.5). */
export function maxDrawdownPct(closes: number[]): number | null {
  if (closes.length < 3) return null;
  let peak = closes[0]!;
  let worst = 0;
  for (const c of closes) {
    if (!(c > 0)) continue;
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return +(worst * 100).toFixed(2);
}

export function proxiesFromSleeve(sleeve: SleeveWeight[]): EtfRiskProxy[] {
  if (!sleeve.length) {
    return [
      { key: "technology", label: "Technology (XLK)", etf: "XLK", weightPct: 40 },
      { key: "financials", label: "Financials (XLF)", etf: "XLF", weightPct: 30 },
      { key: "healthcare", label: "Healthcare (XLV)", etf: "XLV", weightPct: 20 },
      { key: "cash", label: "Cash", etf: null, weightPct: 10 },
    ];
  }
  return sleeve.map((s) => {
    const map = KEY_TO_ETF[s.key] ?? null;
    return {
      key: s.key,
      label: map?.label ?? s.label,
      etf: map?.etf ?? null,
      weightPct: s.weightPct,
    };
  });
}

export async function buildSleeveRiskReport(
  userId: string,
  sleeve: SleeveWeight[],
  opts?: { windowDays?: number },
): Promise<SleeveRiskReport> {
  const windowDays = opts?.windowDays ?? 60;
  const proxies = proxiesFromSleeve(sleeve);
  const etfProxies = proxies.filter((p) => p.etf);
  const closesByEtf = new Map<string, number[]>();
  let source: string | null = null;
  const notes: string[] = [];

  await Promise.all(
    etfProxies.map(async (p) => {
      const hist = await getHistory(userId, p.etf!, "1y", "1d").catch(() => ({
        available: false,
        bars: [] as Array<{ c: number }>,
        source: undefined as string | undefined,
      }));
      if (!hist.available || hist.bars.length < 20) {
        notes.push(`${p.etf}: history **WAIT** / thin`);
        return;
      }
      closesByEtf.set(
        p.etf!,
        hist.bars.map((b) => b.c).filter((c) => Number.isFinite(c) && c > 0),
      );
      source = hist.source ?? source;
    }),
  );

  const correlations: SleeveRiskReport["correlations"] = [];
  for (let i = 0; i < etfProxies.length; i++) {
    for (let j = i + 1; j < etfProxies.length; j++) {
      const a = etfProxies[i]!.etf!;
      const b = etfProxies[j]!.etf!;
      const ca = closesByEtf.get(a) ?? [];
      const cb = closesByEtf.get(b) ?? [];
      correlations.push({
        a,
        b,
        corr: returnCorrelation(ca, cb, windowDays),
      });
    }
  }

  const maxDrawdowns = proxies.map((p) => {
    if (!p.etf) {
      return { symbol: "CASH", label: p.label, maxDrawdownPct: 0 };
    }
    const closes = closesByEtf.get(p.etf) ?? [];
    return {
      symbol: p.etf,
      label: p.label,
      maxDrawdownPct: maxDrawdownPct(closes),
    };
  });

  const available = closesByEtf.size > 0;
  if (proxies.some((p) => p.key === "cash")) {
    notes.push("Cash sleeve treated as ~0% drawdown ballast (not a traded ETF series).");
  }
  notes.push(
    `Equity sleeves proxied by sector ETFs (XLK/XLF/XLV) — not single-stock holdings.`,
    `Correlation window ≈ ${windowDays} trading days of daily returns.`,
  );

  return {
    available,
    asOf: new Date().toISOString(),
    windowDays,
    proxies,
    correlations,
    maxDrawdowns,
    notes,
    source,
  };
}

export function formatSleeveRiskSection(report: SleeveRiskReport): string[] {
  const lines = [
    "### Sector correlations & historical drawdowns (ETF proxies — verified history)",
    "",
  ];
  if (!report.available) {
    lines.push(
      "- Risk matrix: **WAIT** — sector ETF history unavailable on this turn.",
      "",
    );
    return lines;
  }

  lines.push("_Proxies used (from your sector weights):_");
  for (const p of report.proxies) {
    lines.push(
      `- **${p.label}** · ${p.weightPct}%${p.etf ? ` → \`${p.etf}\`` : " → cash ballast"}`,
    );
  }
  lines.push("");

  if (report.correlations.length) {
    lines.push(`_Pairwise return correlations (~${report.windowDays}d):_`);
    for (const c of report.correlations) {
      lines.push(
        `- ${c.a} vs ${c.b}: ${c.corr !== null ? c.corr.toFixed(2) : "**WAIT**"}`,
      );
    }
    lines.push("");
  }

  lines.push("_Max drawdown (≈1y daily history, peak-to-trough):_");
  for (const d of report.maxDrawdowns) {
    lines.push(
      `- **${d.label}** (\`${d.symbol}\`): ${
        d.maxDrawdownPct !== null ? `${d.maxDrawdownPct.toFixed(2)}%` : "**WAIT**"
      }`,
    );
  }
  lines.push("");
  for (const n of report.notes) lines.push(`- _${n}_`);
  if (report.source) lines.push(`- _History source: ${report.source} · asOf ${report.asOf}_`);
  lines.push("");
  return lines;
}
