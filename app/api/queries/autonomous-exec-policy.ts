/**
 * Broker venue policy for Intelligence / Autonomous (new setup).
 *
 * Default stays PAPER (ai_limits.paperOnly). IBKR only when the user is on
 * AUTONOMOUS_LIVE (paperOnly=false) and IBKR_ACCOUNT is set — or when ops
 * forces INTELLIGENCE_BROKER=IBKR / PAPER.
 */
import { getAiLimits } from "./autonomous";
import { isIbkrAccountConfigured } from "../brokers/ibkr";
import type { BrokerCode } from "../brokers/registry";

export async function resolveIntelligenceBroker(userId: string): Promise<{
  broker: BrokerCode;
  accountId: string | undefined;
  note: string;
}> {
  const forced = process.env.INTELLIGENCE_BROKER?.trim().toUpperCase();
  if (forced === "PAPER") {
    return { broker: "PAPER", accountId: "PAPER-001", note: "INTELLIGENCE_BROKER=PAPER" };
  }
  if (forced === "IBKR") {
    return {
      broker: "IBKR",
      accountId: process.env.IBKR_ACCOUNT?.trim() || undefined,
      note: "INTELLIGENCE_BROKER=IBKR",
    };
  }

  const limits = await getAiLimits(userId);
  const paperOnly = limits.paperOnly !== false;

  if (paperOnly) {
    return {
      broker: "PAPER",
      accountId: "PAPER-001",
      note: "paperOnly → PaperBroker (portal ledger; nothing sent to IBKR until LIVE)",
    };
  }

  if (!isIbkrAccountConfigured()) {
    return {
      broker: "PAPER",
      accountId: "PAPER-001",
      note: "LIVE requested but IBKR_ACCOUNT missing — degraded to PaperBroker",
    };
  }

  return {
    broker: "IBKR",
    accountId: process.env.IBKR_ACCOUNT?.trim(),
    note: "paperOnly=false → IBKR adapter (Client Portal paper/live per gateway login)",
  };
}
