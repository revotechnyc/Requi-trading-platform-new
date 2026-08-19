import { runDeepAudit, runLightChecks } from "./health";

/**
 * In-process health scheduler: LIGHT checks every 5 minutes, DEEP audit
 * twice daily. Timers are unref'd so they never keep the process alive.
 * Safe under multiple restarts — health rows and incidents are persisted,
 * and duplicate open incidents are de-duped by component/test.
 */
const LIGHT_INTERVAL_MS = 5 * 60 * 1000;
const DEEP_INTERVAL_MS = 12 * 60 * 60 * 1000;

let started = false;

export function startHealthScheduler() {
  if (started) return;
  started = true;

  const light = () =>
    runLightChecks().catch((e) => console.error("[health] light checks failed", e));
  const deep = () =>
    runDeepAudit().catch((e) => console.error("[health] deep audit failed", e));

  // Initial pass shortly after boot, then on interval.
  setTimeout(light, 15_000).unref();
  setTimeout(deep, 60_000).unref();
  setInterval(light, LIGHT_INTERVAL_MS).unref();
  setInterval(deep, DEEP_INTERVAL_MS).unref();
  console.log("[health] scheduler started (light 5m, deep 12h)");
}
