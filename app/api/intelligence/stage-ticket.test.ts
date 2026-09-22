import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Advisory } from "./intent";

vi.mock("../queries/tickets", () => ({
  proposeTicket: vi.fn(),
}));

vi.mock("../queries/autonomous-exec-policy", () => ({
  resolveIntelligenceBroker: vi.fn(),
}));

vi.mock("./intent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./intent")>();
  return {
    ...actual,
    clearThreadState: vi.fn(),
    setThreadState: vi.fn(),
  };
});

import { proposeTicket } from "../queries/tickets";
import { resolveIntelligenceBroker } from "../queries/autonomous-exec-policy";
import { stageTicketFromAdvisory } from "./stage-ticket";

const proposeTicketMock = vi.mocked(proposeTicket);
const resolveBrokerMock = vi.mocked(resolveIntelligenceBroker);

function advisory(partial: Partial<Advisory> & Pick<Advisory, "verdict">): Advisory {
  return {
    symbol: "AAPL",
    side: "BUY",
    reasons: ["unit-test reason"],
    dataQuality: { fresh: true, bars: 50, marketOpen: true, delaySeconds: 0 },
    setup: { strategyId: "MANUAL", confidence: 0.7, reasons: ["test"] },
    sizingPreview: { qty: 5, dollarRisk: 50, cappedBy: "test" },
    proposed: { lastPrice: 100, note: "test" },
    watchFor: null,
    currentHeatPct: 0,
    governanceVersion: "test",
    composedAt: Date.now(),
    ...partial,
  };
}

describe("stageTicketFromAdvisory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveBrokerMock.mockResolvedValue({
      broker: "PAPER",
      accountId: "PAPER-001",
      note: "INTELLIGENCE_BROKER=PAPER",
    });
    proposeTicketMock.mockResolvedValue({
      ticket: {
        ticketId: "MANUAL-TEST-0001",
        symbol: "AAPL",
        side: "BUY",
        quantity: 5,
        orderType: "LMT",
        limitPrice: 100,
        broker: "PAPER",
        effectiveBroker: "PAPER",
      },
      degradedNote: undefined,
    } as never);
  });

  it("refuses WAIT and does not call proposeTicket", async () => {
    const res = await stageTicketFromAdvisory("user-1", advisory({ verdict: "WAIT" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reply).toMatch(/WAIT/i);
      expect(res.reply).toMatch(/Nothing was staged/i);
    }
    expect(proposeTicketMock).not.toHaveBeenCalled();
  });

  it("refuses UNFAVORABLE and does not call proposeTicket", async () => {
    const res = await stageTicketFromAdvisory("user-1", advisory({ verdict: "UNFAVORABLE" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toMatch(/UNFAVORABLE/);
    expect(proposeTicketMock).not.toHaveBeenCalled();
  });

  it("refuses BLOCKED and does not call proposeTicket", async () => {
    const res = await stageTicketFromAdvisory("user-1", advisory({ verdict: "BLOCKED" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toMatch(/BLOCKED/);
    expect(proposeTicketMock).not.toHaveBeenCalled();
  });

  it("stages FAVORABLE via proposeTicket", async () => {
    const res = await stageTicketFromAdvisory("user-1", advisory({ verdict: "FAVORABLE" }), {
      quantity: 5,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ticketId).toBe("MANUAL-TEST-0001");
      expect(res.reply).toMatch(/CONFIRM ORDER MANUAL-TEST-0001/);
    }
    expect(proposeTicketMock).toHaveBeenCalledTimes(1);
    expect(resolveBrokerMock).toHaveBeenCalledWith("user-1");
  });
});
