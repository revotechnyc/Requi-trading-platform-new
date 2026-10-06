import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./autonomous", () => ({
  getAiLimits: vi.fn(async () => ({ paperOnly: true })),
}));

describe("resolveIntelligenceBroker", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("forces PAPER when INTELLIGENCE_BROKER=PAPER", async () => {
    vi.stubEnv("INTELLIGENCE_BROKER", "PAPER");
    vi.stubEnv("IBKR_ACCOUNT", "DUR506819");
    const { resolveIntelligenceBroker } = await import("./autonomous-exec-policy");
    const r = await resolveIntelligenceBroker("u1");
    expect(r.broker).toBe("PAPER");
    expect(r.accountId).toBe("PAPER-001");
  });

  it("routes to IBKR Paper when forced IBKR with DU account", async () => {
    vi.stubEnv("INTELLIGENCE_BROKER", "IBKR");
    vi.stubEnv("IBKR_ACCOUNT", "DUR506819");
    vi.stubEnv("LIVE_TRADING_ENABLED", "");
    const { resolveIntelligenceBroker } = await import("./autonomous-exec-policy");
    const r = await resolveIntelligenceBroker("u1");
    expect(r.broker).toBe("IBKR");
    expect(r.accountId).toBe("DUR506819");
  });

  it("auto-prefers IBKR when IBKR_ACCOUNT is paper DU…", async () => {
    vi.stubEnv("INTELLIGENCE_BROKER", "");
    vi.stubEnv("IBKR_ACCOUNT", "DUR506819");
    const { resolveIntelligenceBroker } = await import("./autonomous-exec-policy");
    const r = await resolveIntelligenceBroker("u1");
    expect(r.broker).toBe("IBKR");
    expect(r.accountId).toBe("DUR506819");
  });

  it("degrades live U… account when LIVE not unlocked", async () => {
    vi.stubEnv("INTELLIGENCE_BROKER", "IBKR");
    vi.stubEnv("IBKR_ACCOUNT", "U1234567");
    vi.stubEnv("LIVE_TRADING_ENABLED", "false");
    const { resolveIntelligenceBroker } = await import("./autonomous-exec-policy");
    const r = await resolveIntelligenceBroker("u1");
    expect(r.broker).toBe("PAPER");
  });
});
