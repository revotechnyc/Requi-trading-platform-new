import { createRouter, publicQuery } from "./middleware";
import { authRouter } from "./auth-router";
import { intelligenceRouter } from "./intelligence-router";
import { tradingRouter, marketplaceRouter, supportRouter, adminRouter } from "./trading-router";
import { autonomousRouter } from "./autonomous-router";
import { alertsRouter } from "./alerts-router";
import { governanceRouter } from "./governance-router";
import { executionRouter } from "./execution-router";
import { marketDataRouter } from "./marketdata-router";
import { engineRouter } from "./engine-router";
import { signalsRouter } from "./signals-router";
import { financialsRouter } from "./financials-router";
import { systemCheckRouter } from "./systemcheck-router";
import { legalRouter } from "./legal-router";
import { ownerRouter } from "./owner-router";
import { notificationsRouter } from "./notifications-router";
import { billingRouter } from "./billing-router";
import { conversationsRouter } from "./conversations-router";
import { scheduledTasksRouter } from "./scheduled-tasks-router";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ status: "ok", ts: new Date().toISOString() })),
  auth: authRouter,
  intelligence: intelligenceRouter,
  trading: tradingRouter,
  marketplace: marketplaceRouter,
  support: supportRouter,
  admin: adminRouter,
  autonomous: autonomousRouter,
  alerts: alertsRouter,
  governance: governanceRouter,
  execution: executionRouter,
  marketData: marketDataRouter,
  engine: engineRouter,
  signals: signalsRouter,
  financials: financialsRouter,
  systemCheck: systemCheckRouter,
  legal: legalRouter,
  owner: ownerRouter,
  notifications: notificationsRouter,
  billing: billingRouter,
  conversations: conversationsRouter,
  scheduledTasks: scheduledTasksRouter,
});

export type AppRouter = typeof appRouter;
