/**
 * Coding-only hyp portfolio ETF risk helpers (no new vendors).
 */
import { describe, expect, it } from "vitest";
import {
  maxDrawdownPct,
  proxiesFromSleeve,
  formatSleeveRiskSection,
  type SleeveRiskReport,
} from "./hyp-portfolio-risk";
import { parseSectorSleeve, formatHypotheticalPortfolioReply } from "./data-reply";

describe("hyp-portfolio-risk — math", () => {
  it("maxDrawdownPct finds peak-to-trough", () => {
    expect(maxDrawdownPct([100, 110, 90, 95])).toBeCloseTo(-18.18, 1);
    expect(maxDrawdownPct([1])).toBeNull();
  });

  it("proxiesFromSleeve maps client Prompt 5 weights to XLK/XLF/XLV/cash", () => {
    const sleeve = parseSectorSleeve(
      "40% technology stocks, 30% financial stocks, 20% healthcare stocks, and 10% cash",
    );
    const proxies = proxiesFromSleeve(sleeve);
    expect(proxies.find((p) => p.key === "technology")?.etf).toBe("XLK");
    expect(proxies.find((p) => p.key === "financials")?.etf).toBe("XLF");
    expect(proxies.find((p) => p.key === "healthcare")?.etf).toBe("XLV");
    expect(proxies.find((p) => p.key === "cash")?.etf).toBeNull();
  });

  it("formatSleeveRiskSection renders correlations and drawdowns", () => {
    const report: SleeveRiskReport = {
      available: true,
      asOf: "2026-09-24T12:00:00.000Z",
      windowDays: 60,
      proxies: [
        { key: "technology", label: "Technology (XLK)", etf: "XLK", weightPct: 40 },
        { key: "financials", label: "Financials (XLF)", etf: "XLF", weightPct: 30 },
        { key: "cash", label: "Cash", etf: null, weightPct: 10 },
      ],
      correlations: [{ a: "XLK", b: "XLF", corr: 0.62 }],
      maxDrawdowns: [
        { symbol: "XLK", label: "Technology (XLK)", maxDrawdownPct: -22.5 },
        { symbol: "XLF", label: "Financials (XLF)", maxDrawdownPct: -18.1 },
        { symbol: "CASH", label: "Cash", maxDrawdownPct: 0 },
      ],
      notes: ["Equity sleeves proxied by sector ETFs"],
      source: "yahoo",
    };
    const lines = formatSleeveRiskSection(report).join("\n");
    expect(lines).toMatch(/XLK vs XLF: 0\.62/);
    expect(lines).toMatch(/-22\.50%/);
    expect(lines).toMatch(/Cash/);
  });

  it("hyp reply includes risk section when provided", () => {
    const q =
      "hypothetical $100,000 portfolio consisting of 40% technology stocks, 30% financial stocks, 20% healthcare stocks, and 10% cash under declining interest rates";
    const reply = formatHypotheticalPortfolioReply(q, {
      riskSectionLines: [
        "### Sector correlations & historical drawdowns (ETF proxies — verified history)",
        "",
        "- XLK vs XLF: 0.55",
      ],
    });
    expect(reply).toMatch(/XLK vs XLF/);
    expect(reply).toMatch(/Declining interest rates/);
    expect(reply).toMatch(/40%/);
  });
});
