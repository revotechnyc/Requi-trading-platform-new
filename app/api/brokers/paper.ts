import type { BrokerAdapter, BrokerAccount, BrokerCapabilities, BrokerOrderAck, BrokerPosition, OrderIntent } from "./types";

/**
 * Deterministic paper broker — the default execution plane. Simulates ACK and
 * immediate fill at the limit/stop/reference price so the full ticketed
 * confirmation flow is exercisable end-to-end without credentials.
 */
export class PaperBroker implements BrokerAdapter {
  readonly code = "PAPER" as const;
  readonly displayName = "Requi Paper Exchange";
  private seq = 100000;
  private orders = new Map<string, { intent: OrderIntent; price: number }>();

  capabilities(): BrokerCapabilities {
    return {
      assetClasses: ["Stocks", "Options", "Futures", "Crypto"],
      orderTypes: ["MKT", "LMT", "STP", "STP_LMT", "TRAIL"],
      streaming: true,
      extendedHours: true,
      multiLegOptions: true,
      bracketOco: true,
      paperTrading: true,
      notes: "Deterministic simulator — instant ACK, instant fill at reference price. Default execution plane until live credentials are configured.",
    };
  }

  async healthCheck() {
    return { ok: true, detail: "paper exchange operational" };
  }

  async getAccounts(): Promise<BrokerAccount[]> {
    return [{ accountId: "PAPER-001", label: "Paper Sandbox", equity: 100000, cash: 100000, buyingPower: 100000 }];
  }

  async getPositions(_accountId: string): Promise<BrokerPosition[]> {
    return [];
  }

  async placeOrder(_accountId: string, intent: OrderIntent): Promise<BrokerOrderAck> {
    const id = `PPR-${++this.seq}`;
    const price = intent.limitPrice ?? intent.stopPrice ?? 100;
    this.orders.set(id, { intent, price });
    return { brokerOrderId: id, status: "FILLED", filledQuantity: intent.quantity, averagePrice: price, message: "paper fill" };
  }

  async cancelOrder(_accountId: string, brokerOrderId: string) {
    const existed = this.orders.delete(brokerOrderId);
    return { ok: existed, message: existed ? "canceled" : "order not found" };
  }

  async getOrderStatus(_accountId: string, brokerOrderId: string): Promise<BrokerOrderAck> {
    const o = this.orders.get(brokerOrderId);
    if (!o) return { brokerOrderId, status: "FILLED" };
    return { brokerOrderId, status: "FILLED", filledQuantity: o.intent.quantity, averagePrice: o.price };
  }
}
