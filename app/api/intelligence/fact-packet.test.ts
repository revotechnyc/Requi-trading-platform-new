/**
 * Phase B — fact packet + Lucia gate (no free-form LLM on hard data intents).
 */
import { describe, expect, it } from "vitest";
import {
  buildFactPacket,
  ensureFactPacket,
  factPacketDeveloperBlock,
  formatNoPacketWaitReply,
  requiresDeterministicFactPacket,
  shouldBlockLuciaWithoutPacket,
  stampFactPacketFromMeta,
} from "./fact-packet";
import { classifyGlobalIntent } from "./intent-firewall";

describe("fact packet — Lucia gate", () => {
  it("requires packets for movers / desk / screen / technicals / hyp / discovery / market", () => {
    expect(requiresDeterministicFactPacket("MOVERS")).toBe(true);
    expect(requiresDeterministicFactPacket("DESK_COMPARE")).toBe(true);
    expect(requiresDeterministicFactPacket("EARNINGS_SCREEN")).toBe(true);
    expect(requiresDeterministicFactPacket("TECHNICALS")).toBe(true);
    expect(requiresDeterministicFactPacket("HYP_PORTFOLIO")).toBe(true);
    expect(requiresDeterministicFactPacket("DISCOVERY")).toBe(true);
    expect(requiresDeterministicFactPacket("GENERAL_MARKET")).toBe(true);
    expect(requiresDeterministicFactPacket("EARNINGS_RESEARCH")).toBe(true);
    expect(requiresDeterministicFactPacket("CHITCHAT")).toBe(false);
    expect(requiresDeterministicFactPacket("UNKNOWN")).toBe(false);
  });

  it("blocks Lucia without packet on client-style hard data prompts", () => {
    expect(
      shouldBlockLuciaWithoutPacket(
        "Which names are ripping with high relative volume right now? Flag anything that looks like after-hours only.",
      ),
    ).toBe(true);
    expect(
      shouldBlockLuciaWithoutPacket(
        "Compare Amazon, Disney, and Walmart on free cash flow, margins, and valuation.",
      ),
    ).toBe(true);
    expect(
      shouldBlockLuciaWithoutPacket(
        "Identify three names reporting earnings within the next 4 days that tend to beat.",
      ),
    ).toBe(true);
    expect(
      shouldBlockLuciaWithoutPacket(
        "Walk NVIDIA's tape with RSI, MACD, SMAs, volume, and support and resistance.",
      ),
    ).toBe(true);
    expect(
      shouldBlockLuciaWithoutPacket(
        "Imaginary $150,000 allocation in technology and healthcare — stress under rate hikes.",
      ),
    ).toBe(true);
  });

  it("does not block chitchat / open conversational turns", () => {
    expect(shouldBlockLuciaWithoutPacket("Thanks, that helps.")).toBe(false);
    expect(shouldBlockLuciaWithoutPacket("What can you help me with today?")).toBe(false);
  });

  it("WAIT reply is honest and intent-labeled", () => {
    const intent = classifyGlobalIntent(
      "Which names are ripping with high relative volume right now?",
    );
    const reply = formatNoPacketWaitReply(intent, "Which names are ripping with high relative volume right now?");
    expect(reply).toMatch(/WAIT/i);
    expect(reply).toMatch(/will \*\*not\*\* invent/i);
    expect(reply).toMatch(/MOVERS/i);
  });
});

describe("fact packet — stamp + developer block", () => {
  it("buildFactPacket marks hasVerifiedFacts from field status", () => {
    const empty = buildFactPacket({ intent: "MOVERS" });
    expect(empty.hasVerifiedFacts).toBe(false);

    const ok = buildFactPacket({
      intent: "DESK_COMPARE",
      symbols: ["AMZN", "DIS"],
      fields: [{ name: "fcf", value: 1, status: "verified", source: "desk-compare" }],
    });
    expect(ok.hasVerifiedFacts).toBe(true);
    expect(ok.version).toBe(1);
  });

  it("stampFactPacketFromMeta + ensureFactPacket attach once", () => {
    const stamped = stampFactPacketFromMeta("Compare AAPL and MSFT on margins", {
      symbols: ["AAPL", "MSFT"],
      sourceName: "desk-compare",
      timestamp: "2026-09-24T12:00:00.000Z",
    });
    expect(stamped.intent).toBe("DESK_COMPARE");
    expect(stamped.symbols).toEqual(["AAPL", "MSFT"]);
    expect(stamped.hasVerifiedFacts).toBe(true);

    const result = {
      reply: "ok",
      meta: {
        symbols: ["NVDA"],
        source: "test",
        sourceName: "technicals-v1",
        stale: false,
        timestamp: "2026-09-24T12:00:00.000Z",
      },
    };
    ensureFactPacket(result, "Walk NVDA with RSI and MACD");
    const first = result.factPacket;
    ensureFactPacket(result, "Walk NVDA with RSI and MACD");
    expect(result.factPacket).toBe(first);
    expect(result.factPacket?.intent).toBe("TECHNICALS");
  });

  it("factPacketDeveloperBlock forbids inventing beyond fields", () => {
    const packet = buildFactPacket({
      intent: "MOVERS",
      symbols: ["XYZ"],
      sourceName: "market-movers",
      fields: [{ name: "rvol", value: 3.2, status: "verified", source: "market-movers" }],
    });
    const block = factPacketDeveloperBlock(packet);
    expect(block).toMatch(/VERIFIED FACT PACKET/i);
    expect(block).toMatch(/rvol: 3\.2/);
    expect(block).toMatch(/Do not fill gaps from memory/i);
  });
});
