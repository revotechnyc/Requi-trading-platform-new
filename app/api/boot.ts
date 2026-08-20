import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { createGoogleStartHandler, createGoogleCallbackHandler } from "./google/auth";
import { runMigrations } from "./lib/migrate";
import { ensureGovernanceReady } from "./governance/runtime";
import { ensureSystemCheckLoop } from "./systemcheck/service";
import { ensureTrailingLoop } from "./engine/trailing";
import { ensureUniverseLoop } from "./engine/universe";
import { ensureSessionLoop } from "./events";
import { ensureLegalDocsSeeded } from "./legal-router";
import { createStripeWebhookHandler } from "./billing/stripe-webhook";
import { startHealthScheduler } from "./platform/scheduler";
import { startTaskScheduler } from "./scheduler-runner";
import { startAutonomousRunner } from "./autonomous/runner";
import { intelligenceStreamHandler } from "./intelligence-stream";
import { Paths } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());
// Google Sign-In (preliminary) — credential-free until GOOGLE_CLIENT_ID/SECRET are set
app.get("/api/auth/google", createGoogleStartHandler());
app.get("/api/auth/google/callback", createGoogleCallbackHandler());
// Stripe webhooks: verified + idempotent; browser is never authoritative.
app.post("/api/webhooks/stripe", createStripeWebhookHandler());
app.post("/api/intelligence/stream", (c) => intelligenceStreamHandler(c));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  await runMigrations(); // version-controlled PostgreSQL migrations (db/migrations) — deterministic dev→staging→prod
  await ensureGovernanceReady(); // registry sync + signed genesis governance package if none active
  ensureSystemCheckLoop(); // pre-open (09:00 ET) + post-close (16:15 ET) health runs, Mon–Fri
  ensureTrailingLoop(); // 5s protective-exit cycle during market hours — flat stop, 2.5×ATR trail, safety flatten
  ensureUniverseLoop(); // 60s engine heartbeat — feed refresh → monitor evaluation → auto-universe cycles
  ensureSessionLoop(); // 30s NYSE session watcher — MARKET_OPENED / MARKET_CLOSED events (idempotent fan-out)
  startHealthScheduler(); // light checks every 5m + deep audit 2×/day, auto-incidents
  startTaskScheduler(); // due scheduled Intelligence tasks every 60s
  startAutonomousRunner(); // advances RUNNING autonomous sessions every 2.5s
  const { syncIndicatorRegistry } = await import("./indicators/registry");
  await syncIndicatorRegistry(); // mirror the code indicator registry into indicator_registry (audit mirror)
  await ensureLegalDocsSeeded(); // versioned legal library (LEGAL_REVIEW drafts) — never overwrites existing rows
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = env.port;
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
} else {
  // Dev server (vite @hono/vite-dev-server): the autonomous session runner and
  // task scheduler still run so sessions/streaming work outside production.
  startTaskScheduler();
  startAutonomousRunner();
  void import("./indicators/registry").then((m) => m.syncIndicatorRegistry());
}
