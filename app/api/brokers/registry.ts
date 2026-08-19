import { IbkrBroker } from "./ibkr";
import { PaperBroker } from "./paper";
import { RobinhoodMcpBroker } from "./robinhood-mcp";
import type { BrokerAdapter } from "./types";

/**
 * Broker registry — resolves the execution plane for a requested broker code.
 *
 * Selection rules:
 * - PAPER is always available and is the safe default.
 * - ROBINHOOD_MCP activates when ROBINHOOD_MCP_TOKEN is configured.
 * - IBKR activates when IBKR_ACCOUNT is configured (gateway reachable).
 * - A request for an unconfigured live broker falls back to PAPER and says
 *   so explicitly — execution never silently changes venue.
 */

export type BrokerCode = "PAPER" | "ROBINHOOD_MCP" | "IBKR";

export function resolveBroker(code: BrokerCode): { adapter: BrokerAdapter; effective: BrokerCode; degraded: boolean; note?: string } {
  if (code === "ROBINHOOD_MCP") {
    const token = process.env.ROBINHOOD_MCP_TOKEN;
    if (token) return { adapter: new RobinhoodMcpBroker(token), effective: "ROBINHOOD_MCP", degraded: false };
    return { adapter: new PaperBroker(), effective: "PAPER", degraded: true, note: "ROBINHOOD_MCP_TOKEN not configured — routed to paper execution" };
  }
  if (code === "IBKR") {
    if (process.env.IBKR_ACCOUNT) return { adapter: new IbkrBroker(), effective: "IBKR", degraded: false };
    return { adapter: new PaperBroker(), effective: "PAPER", degraded: true, note: "IBKR_ACCOUNT not configured — routed to paper execution" };
  }
  return { adapter: new PaperBroker(), effective: "PAPER", degraded: false };
}

export async function brokerStatuses() {
  const out: Array<{ code: BrokerCode; displayName: string; configured: boolean; ok: boolean; detail: string; capabilities: ReturnType<BrokerAdapter["capabilities"]> }> = [];
  const paper = new PaperBroker();
  out.push({ code: "PAPER", displayName: paper.displayName, configured: true, ok: true, detail: "always available", capabilities: paper.capabilities() });

  const rhToken = process.env.ROBINHOOD_MCP_TOKEN;
  const rh = rhToken ? new RobinhoodMcpBroker(rhToken) : null;
  out.push({
    code: "ROBINHOOD_MCP",
    displayName: "Robinhood (Agentic Trading MCP)",
    configured: !!rhToken,
    ok: rh ? (await rh.healthCheck()).ok : false,
    detail: rh ? (await rh.healthCheck()).detail : "set ROBINHOOD_MCP_TOKEN (OAuth bearer from the Robinhood agentic linking flow)",
    capabilities: (rh ?? new RobinhoodMcpBroker("")).capabilities(),
  });

  const ibkrAccount = process.env.IBKR_ACCOUNT;
  const ibkr = ibkrAccount ? new IbkrBroker(ibkrAccount) : null;
  out.push({
    code: "IBKR",
    displayName: "Interactive Brokers (Client Portal API)",
    configured: !!ibkrAccount,
    ok: ibkr ? (await ibkr.healthCheck()).ok : false,
    detail: ibkr ? (await ibkr.healthCheck()).detail : "set IBKR_ACCOUNT and authenticate the Client Portal Gateway (IBKR_GATEWAY_URL)",
    capabilities: new IbkrBroker().capabilities(),
  });

  return out;
}
