import { createRouter, adminQuery } from "./middleware";
import { getLatestReport, listReports, runSystemCheck, systemCheckLoopStatus } from "./systemcheck/service";

/**
 * SYSTEM CHECK API — owner-only (admin role). The platform's health and
 * self-diagnosis surface: latest report, history, manual run, scheduler
 * status. Scheduled runs (pre-open / post-close ET) happen server-side;
 * these routes expose them to the owner console.
 */
export const systemCheckRouter = createRouter({
  latest: adminQuery.query(async () => ({
    report: await getLatestReport(),
    loop: systemCheckLoopStatus(),
  })),

  history: adminQuery.query(async () => listReports(20)),

  runNow: adminQuery.mutation(async () => runSystemCheck("MANUAL")),
});
