/**
 * Unified broker adapter contract.
 *
 * Every execution path in Requi — Intelligence proposals, Autonomous loop
 * orders, protection placements — funnels through this interface. Adapters
 * translate the canonical OrderIntent into broker-native calls (Robinhood
 * Trading MCP, IBKR Client Portal Web API, or the deterministic paper
 * simulator). No adapter may be called without a confirmed, unexpired ticket
 * (enforced by the ticket service, never by the adapter).
 */

export type OrderType = "MKT" | "LMT" | "STP" | "STP_LMT" | "TRAIL";
export type TimeInForce = "DAY" | "GTC" | "IOC" | "OPG" | "CLS";

export interface OrderIntent {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  trailAmount?: number;
  tif: TimeInForce;
  /** Idempotency key — brokers must treat duplicates of this key as the same order. */
  clientOrderId: string;
}

export interface BrokerOrderAck {
  brokerOrderId: string;
  status: "ACKNOWLEDGED" | "WORKING" | "FILLED" | "REJECTED" | "UNKNOWN";
  filledQuantity?: number;
  averagePrice?: number;
  message?: string;
}

export interface BrokerPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface BrokerAccount {
  accountId: string;
  label: string;
  equity: number;
  cash: number;
  buyingPower: number;
}

export interface BrokerOpenOrder {
  brokerOrderId: string;
  symbol: string | null; // ticker when the broker reports one (null = match by other means)
  side: "BUY" | "SELL" | null;
  orderType: string; // broker-native string, uppercased by the adapter
  quantity: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  clientOrderId: string | null;
  status: string;
}

export interface BrokerCapabilities {
  assetClasses: string[];
  orderTypes: OrderType[];
  streaming: boolean;
  extendedHours: boolean;
  multiLegOptions: boolean;
  bracketOco: boolean;
  paperTrading: boolean;
  notes: string;
}

export interface BrokerAdapter {
  readonly code: "PAPER" | "ROBINHOOD_MCP" | "IBKR";
  readonly displayName: string;
  capabilities(): BrokerCapabilities;
  /** Verify the session/credentials are live. Never throws — returns status. */
  healthCheck(): Promise<{ ok: boolean; detail: string }>;
  getAccounts(): Promise<BrokerAccount[]>;
  getPositions(accountId: string): Promise<BrokerPosition[]>;
  placeOrder(accountId: string, intent: OrderIntent): Promise<BrokerOrderAck>;
  /** Live (unfilled, uncancelled) orders — optional; adapters without an open-orders endpoint omit it. */
  getOpenOrders?(accountId: string): Promise<BrokerOpenOrder[]>;
  cancelOrder(accountId: string, brokerOrderId: string): Promise<{ ok: boolean; message: string }>;
  getOrderStatus(accountId: string, brokerOrderId: string): Promise<BrokerOrderAck>;
}
