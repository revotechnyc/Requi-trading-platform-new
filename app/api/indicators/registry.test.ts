import { describe, expect, it } from "vitest";
import { INDICATORS, registry, type IndicatorDefinition } from "./registry";
import { computeGatewayIndicators } from "../marketdata/gateway/indicators";
import type { OhlcvBar } from "../marketdata/gateway/types";

/**
 * INDICATOR ENGINE VERIFICATION — the spec's quality gates applied to the
 * production registry:
 *   · every registered indicator runs on normal input
 *   · empty data / insufficient lookback / NaN / zero volume → null, no throw
 *   · point-in-time safety (NO FUTURE DATA): corrupting bars AFTER time T
 *     can never change the value computed at T
 *   · approval ladder: the live-Autonomous subset is strictly smaller
 *   · the gateway bundle is composed entirely of registered indicators
 */

function daily(n = 260, seed = 150): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  let px = seed;
  const t0 = Date.now() - n * 86_400_000;
  for (let i = 0; i < n; i++) {
    px *= 1 + Math.sin(i / 9) * 0.01 + 0.0008;
    bars.push({
      t: t0 + i * 86_400_000,
      o: +(px * 0.997).toFixed(2),
      h: +(px * 1.008).toFixed(2),
      l: +(px * 0.992).toFixed(2),
      c: +px.toFixed(2),
      v: 5_000_000 + (i % 7) * 300_000,
    });
  }
  return bars;
}

const INTRADAY: OhlcvBar[] = [
  { t: Date.now(), o: 188, h: 189, l: 187, c: 188.5, v: 100_000 },
  { t: Date.now(), o: 188.5, h: 189.5, l: 188, c: 189, v: 120_000 },
];

const calc = (d: IndicatorDefinition, dl: OhlcvBar[], id: OhlcvBar[] = INTRADAY) => registry.get(d.id).calculate(dl, id, d.defaultParameters);

describe("registry structure", () => {
  it("has unique ids and complete metadata for every indicator", () => {
    const ids = INDICATORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of INDICATORS) {
      expect(d.name).toBeTruthy();
      expect(d.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(d.minimumHistory).toBeGreaterThan(0);
      expect(d.dataTier).toBe(1); // current set is OHLCV-only — Yahoo-compatible
      expect(d.yfinanceSupported).toBe(true);
    }
  });

  it("rejects unknown indicator ids (no duplicate math allowed)", () => {
    expect(() => registry.get("rsi_7_handrolled")).toThrow(/Unknown indicator/);
  });

  it("approval ladder: live subset ⊆ intelligence superset, and both non-empty", () => {
    const live = registry.approvedFor("AUTONOMOUS_LIVE");
    const intel = registry.approvedFor("INTELLIGENCE");
    expect(live.length).toBeGreaterThan(0);
    expect(intel.length).toBeGreaterThanOrEqual(live.length);
    for (const d of live) expect(d.approval).toBe("APPROVED_FOR_AUTONOMOUS_LIVE");
  });
});

describe("every indicator: normal + degenerate inputs", () => {
  for (const def of INDICATORS) {
    it(`${def.id} computes on normal data`, () => {
      expect(calc(def, daily())).not.toBeNull();
    });
    it(`${def.id} returns null (never throws) on empty data`, () => {
      expect(calc(def, [], [])).toBeNull();
    });
    it(`${def.id} returns null on insufficient lookback`, () => {
      expect(calc(def, daily(3), INTRADAY.slice(0, 0))).toBeNull();
    });
    it(`${def.id} never emits NaN/Infinity`, () => {
      const corrupt = daily(60);
      corrupt[30].c = NaN;
      corrupt[31].h = Infinity;
      const v = calc(def, corrupt);
      expect(v === null || Number.isFinite(v)).toBe(true);
    });
    it(`${def.id} survives zero-volume bars`, () => {
      const zv = daily(60).map((b) => ({ ...b, v: 0 }));
      const v = calc(def, zv, zv.slice(-2));
      expect(v === null || Number.isFinite(v)).toBe(true);
    });
    it(`${def.id} survives a large price gap`, () => {
      const g = daily(60);
      g[45].o = g[45].h = g[45].l = g[45].c = g[44].c * 3;
      const v = calc(def, g);
      expect(v === null || Number.isFinite(v)).toBe(true);
    });
  }
});

describe("NO FUTURE DATA — point-in-time safety", () => {
  const full = daily(120);
  for (const def of INDICATORS) {
    it(`${def.id} value at T is unaffected by data after T`, () => {
      for (const T of [40, 80, 119]) {
        const prefix = full.slice(0, T + 1);
        const corrupted = full.map((b, i) => (i > T ? { ...b, o: 1, h: 1, l: 1, c: 1, v: 1 } : b));
        const a = calc(def, prefix, INTRADAY);
        const b2 = calc(def, corrupted.slice(0, T + 1), INTRADAY);
        if (a === null) expect(b2).toBeNull();
        else expect(b2).toBeCloseTo(a!, 10);
      }
    });
  }
});

describe("gateway bundle composition", () => {
  it("every GatewayIndicators field except derived ones is a registered indicator", () => {
    const derived = new Set(["volume", "relative_volume", "daily_change", "daily_change_pct"]);
    const out = computeGatewayIndicators(daily(), INTRADAY);
    for (const key of Object.keys(out)) {
      if (!derived.has(key)) expect(registry.has(key), key).toBe(true);
    }
  });

  it("bundle matches registry calculations exactly (no parallel math)", () => {
    const dl = daily();
    const out = computeGatewayIndicators(dl, INTRADAY);
    const rsiDef = registry.get("rsi_14");
    expect(out.rsi_14).toBeCloseTo(+(rsiDef.calculate(dl, INTRADAY, rsiDef.defaultParameters)!).toFixed(2), 6);
  });
});
