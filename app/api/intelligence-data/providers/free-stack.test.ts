import { describe, expect, it } from "vitest";
import { epsSurprisePercent, summarizeBeatHistory } from "./earnings-history";
import { formatFredMacroBrief, type FredMacroBackdrop } from "./fred";

describe("alpha vantage / history helpers", () => {
  it("keeps surprise percent stable and null near zero consensus", () => {
    expect(epsSurprisePercent(1.1, 1.0)).toBeCloseTo(10, 5);
    expect(epsSurprisePercent(1, 0)).toBeNull();
  });

  it("summarizes beat history", () => {
    const summary = summarizeBeatHistory([
      { period: "2024-01-01", year: 2024, quarter: 1, actual: 1.2, estimate: 1.0, surprise: 0.2, surprisePercent: 20 },
      { period: "2024-04-01", year: 2024, quarter: 2, actual: 0.9, estimate: 1.0, surprise: -0.1, surprisePercent: -10 },
    ]);
    expect(summary.quarters).toBe(2);
    expect(summary.epsBeatCount).toBe(1);
    expect(summary.epsBeatRate).toBe(50);
  });
});

describe("fred macro brief", () => {
  it("formats unavailable honestly", () => {
    const backdrop: FredMacroBackdrop = {
      available: false,
      asOf: "2026-09-09T00:00:00.000Z",
      series: [],
      source: "FRED",
      error: "FRED_API_KEY not configured",
    };
    const lines = formatFredMacroBrief(backdrop);
    expect(lines[0]).toContain("unavailable");
  });

  it("formats retrieved series", () => {
    const backdrop: FredMacroBackdrop = {
      available: true,
      asOf: "2026-09-09T00:00:00.000Z",
      series: [
        { seriesId: "FEDFUNDS", title: "Federal Funds Rate", date: "2026-08-01", value: 5.33 },
        { seriesId: "UNRATE", title: "Unemployment Rate", date: "2026-08-01", value: 4.2 },
      ],
      source: "FRED",
    };
    const lines = formatFredMacroBrief(backdrop);
    expect(lines.some((l) => l.includes("Federal Funds Rate"))).toBe(true);
    expect(lines.some((l) => l.includes("Unemployment Rate"))).toBe(true);
  });
});
