/**
 * Broker venue policy for Intelligence / Autonomous (new setup).
 *
 * Prefer IBKR Paper (DU…) when configured so Intelligence NL trades hit the
 * same Client Portal paper account as Autonomous — without enabling live U…
 * accounts. Ops can still force PAPER or IBKR via INTELLIGENCE_BROKER.
 */
import { getAiLimits } from "./autonomous";
import {
  assertIbkrPaperUnlessLiveUnlocked,
  configuredIbkrAccountId,
  isIbkrAccountConfigured,
  isIbkrPaperAccountId,
  isLiveTradingUnlocked,
} from "../brokers/ibkr";
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
    const accountId = configuredIbkrAccountId() || undefined;
    if (!accountId) {
      return {
        broker: "PAPER",
        accountId: "PAPER-001",
        note: "INTELLIGENCE_BROKER=IBKR but IBKR_ACCOUNT missing — degraded to PaperBroker",
      };
    }
    try {
      assertIbkrPaperUnlessLiveUnlocked(accountId);
    } catch (e) {
      return {
        broker: "PAPER",
        accountId: "PAPER-001",
        note: `${(e as Error).message} — degraded to PaperBroker`,
      };
    }
    return {
      broker: "IBKR",
      accountId,
      note: isIbkrPaperAccountId(accountId)
        ? "INTELLIGENCE_BROKER=IBKR → IBKR Paper (Client Portal)"
        : "INTELLIGENCE_BROKER=IBKR → live unlocked IBKR account",
    };
  }

  // Auto-prefer IBKR Paper when a DU… account is configured (paper trading path).
  // Does not disturb research/CHAT — only used when staging tickets.
  const ibkrId = configuredIbkrAccountId();
  if (ibkrId && isIbkrPaperAccountId(ibkrId)) {
    return {
      broker: "IBKR",
      accountId: ibkrId,
      note: "IBKR_ACCOUNT is paper (DU…) → Intelligence stages to IBKR Paper",
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

  const accountId = configuredIbkrAccountId();
  if (!isIbkrPaperAccountId(accountId) && !isLiveTradingUnlocked()) {
    return {
      broker: "PAPER",
      accountId: "PAPER-001",
      note: "Live IBKR account blocked — LIVE_TRADING_ENABLED required; using PaperBroker",
    };
  }

  return {
    broker: "IBKR",
    accountId,
    note: "paperOnly=false → IBKR adapter (Client Portal paper/live per gateway login)",
  };
}
