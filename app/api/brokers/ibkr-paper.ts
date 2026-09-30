import { and, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { autonomousConfigs, brokerAccounts } from "@db/schema";
import {
  IbkrBroker,
  assertIbkrPaperUnlessLiveUnlocked,
  configuredIbkrAccountId,
  isIbkrAccountConfigured,
  isIbkrPaperAccountId,
} from "./ibkr";

export { isIbkrBrokerAccount } from "./ibkr";

export type IbkrPaperStatus = {
  configured: boolean;
  paper: boolean;
  accountId: string | null;
  gatewayOk: boolean;
  detail: string;
  equity: number;
  cash: number;
  buyingPower: number;
  label: string;
  connectedForUser: boolean;
};

const KEEP_ALIVE_MS = 60_000;

type KeepAliveGlobal = typeof globalThis & {
  __requiIbkrKeepAlive?: { started: boolean; timer?: ReturnType<typeof setInterval> };
};

function broker(): IbkrBroker {
  return new IbkrBroker(configuredIbkrAccountId());
}

export async function ibkrPaperStatus(userId?: string): Promise<IbkrPaperStatus> {
  const accountId = configuredIbkrAccountId() || null;
  const configured = Boolean(accountId);
  const paper = accountId ? isIbkrPaperAccountId(accountId) : false;
  const empty: IbkrPaperStatus = {
    configured,
    paper,
    accountId,
    gatewayOk: false,
    detail: configured
      ? "IBKR_ACCOUNT is set — authenticate the Client Portal Gateway, then connect from Accounts."
      : "Set IBKR_ACCOUNT to your paper id (DU…) and IBKR_GATEWAY_URL, then start the Client Portal Gateway.",
    equity: 0,
    cash: 0,
    buyingPower: 0,
    label: "Interactive Brokers Paper",
    connectedForUser: false,
  };
  if (!configured) return empty;

  try {
    assertIbkrPaperUnlessLiveUnlocked(accountId!);
  } catch (e) {
    return { ...empty, detail: (e as Error).message };
  }

  const ibkr = broker();
  const health = await ibkr.healthCheck();
  let equity = 0;
  let cash = 0;
  let buyingPower = 0;
  let label = "Interactive Brokers Paper";
  if (health.ok) {
    const accounts = await ibkr.getAccounts().catch(() => []);
    const match = accounts.find((a) => a.accountId === accountId) ?? accounts[0];
    if (match) {
      equity = match.equity;
      cash = match.cash;
      buyingPower = match.buyingPower;
      label = match.label || label;
    }
  }

  let connectedForUser = false;
  if (userId) {
    const db = getDb();
    const [row] = await db
      .select({ id: brokerAccounts.id })
      .from(brokerAccounts)
      .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "IBKR")));
    connectedForUser = Boolean(row);
  }

  return {
    configured: true,
    paper,
    accountId,
    gatewayOk: health.ok,
    detail: health.detail,
    equity,
    cash,
    buyingPower,
    label,
    connectedForUser,
  };
}

/** Link the server-configured IBKR paper account to this user so Autonomous can start. */
export async function connectIbkrPaperAccount(userId: string, organizationId?: string | null) {
  if (!isIbkrAccountConfigured()) {
    throw new Error(
      "IBKR paper is not configured on the server. Set IBKR_ACCOUNT=DU… and IBKR_GATEWAY_URL, start the Client Portal Gateway, then log in with 2FA.",
    );
  }
  const accountId = configuredIbkrAccountId();
  assertIbkrPaperUnlessLiveUnlocked(accountId);

  const status = await ibkrPaperStatus(userId);
  if (!status.gatewayOk) {
    throw new Error(
      `IBKR gateway is not ready: ${status.detail}. Open the Client Portal Gateway, complete IBKR login + 2FA, then retry.`,
    );
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "IBKR")))
    .limit(1);

  const values = {
    broker: "IBKR",
    label: `${status.label} (${accountId})`,
    type: "Paper" as const,
    equity: String(status.equity || 0),
    dayPnl: "0",
    status: "Connected" as const,
  };

  let row = existing[0];
  if (row) {
    await db.update(brokerAccounts).set(values).where(eq(brokerAccounts.id, row.id));
    const [updated] = await db.select().from(brokerAccounts).where(eq(brokerAccounts.id, row.id));
    row = updated;
  } else {
    const [created] = await db
      .insert(brokerAccounts)
      .values({
        userId,
        organizationId: organizationId ?? null,
        ...values,
      })
      .returning();
    row = created;
  }

  const [cfg] = await db.select().from(autonomousConfigs).where(eq(autonomousConfigs.userId, userId));
  const defaultAllocation =
    status.equity > 0 ? Math.min(status.equity * 0.1, status.equity) : 10_000;
  if (cfg) {
    await db
      .update(autonomousConfigs)
      .set({
        accountId: row.id,
        ...(parseFloat(cfg.allocationValue) <= 0
          ? { allocationType: "DOLLAR", allocationValue: String(Math.round(defaultAllocation)) }
          : {}),
      })
      .where(eq(autonomousConfigs.id, cfg.id));
  } else {
    await db
      .insert(autonomousConfigs)
      .values({
        userId,
        accountId: row.id,
        mode: "PAPER",
        allocationType: "DOLLAR",
        allocationValue: String(Math.round(defaultAllocation)),
      })
      .onConflictDoNothing();
  }

  return { account: row, ibkr: status };
}

export async function disconnectIbkrPaperAccount(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "IBKR")))
    .limit(1);
  if (!row) return { ok: true, message: "No IBKR paper account was linked." };

  await db
    .update(autonomousConfigs)
    .set({ accountId: null })
    .where(and(eq(autonomousConfigs.userId, userId), eq(autonomousConfigs.accountId, row.id)));
  await db.delete(brokerAccounts).where(eq(brokerAccounts.id, row.id));
  return { ok: true, message: "IBKR paper account unlinked from this workspace. The gateway session is unchanged." };
}

export async function refreshIbkrPaperAccount(userId: string) {
  const status = await ibkrPaperStatus(userId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.userId, userId), eq(brokerAccounts.broker, "IBKR")))
    .limit(1);
  if (row && status.gatewayOk) {
    await db
      .update(brokerAccounts)
      .set({
        equity: String(status.equity || 0),
        status: "Connected",
        label: `${status.label} (${status.accountId ?? ""})`,
      })
      .where(eq(brokerAccounts.id, row.id));
  } else if (row && !status.gatewayOk) {
    await db.update(brokerAccounts).set({ status: "Attention" }).where(eq(brokerAccounts.id, row.id));
  }
  return status;
}

/** Keep the gateway session alive while IBKR_ACCOUNT is configured. */
export function startIbkrKeepAlive(): void {
  const g = globalThis as KeepAliveGlobal;
  if (g.__requiIbkrKeepAlive?.started) return;
  if (!isIbkrAccountConfigured()) return;
  g.__requiIbkrKeepAlive = { started: true };
  g.__requiIbkrKeepAlive.timer = setInterval(() => {
    broker()
      .tickle()
      .then((r) => {
        if (!r.ok) console.warn("[ibkr] tickle:", r.detail);
      })
      .catch((err) => console.warn("[ibkr] tickle failed:", err instanceof Error ? err.message : err));
  }, KEEP_ALIVE_MS);
  g.__requiIbkrKeepAlive.timer.unref?.();
  console.log("[ibkr] paper gateway keep-alive started (60s tickle)");
}
