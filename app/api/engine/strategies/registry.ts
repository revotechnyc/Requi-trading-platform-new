import { createHash } from "crypto";
import { STRATEGY_LIBRARY, FIRST_RELEASE_IDS } from "./library";
import type { StrategyStatus, UniversalStrategy } from "./types";

/**
 * STRATEGY REGISTRY — the engine's view over the embedded library.
 *
 * Determinism contract (§1/§10/§11):
 *  - The library file is the versioned source of truth. Statuses embedded
 *    in code ship through the normal release pipeline; a config hash over
 *    each strategy object makes any change detectable in the audit trail.
 *  - At runtime the registry can only DEMOTE (APPROVED → DISABLED) — the
 *    operator kill. Promotion requires the §14 evidence chain and a
 *    versioned code release. There is no runtime "make this tradable"
 *    path, by design.
 *  - Eligibility for autonomous trading = status APPROVED + executable
 *    mapping present. Both conditions, always.
 */

/** Runtime demotions (operator kill). Never a promotion channel. */
const runtimeDisabled = new Set<string>();

export function getStrategy(id: string): UniversalStrategy | undefined {
  return STRATEGY_LIBRARY.find((s) => s.strategy_id === id.toUpperCase());
}

export function effectiveStatus(s: UniversalStrategy): StrategyStatus {
  return runtimeDisabled.has(s.strategy_id) ? "DISABLED" : s.status;
}

/** sha256 over the strategy object — recorded with every use (§10). Library
 * objects are built by one code path, so key order is stable; any edit to
 * the library (any level) changes the hash. */
export function configHash(s: UniversalStrategy): string {
  return createHash("sha256").update(JSON.stringify(s)).digest("hex").slice(0, 16);
}

export interface RegistryRow {
  strategyId: string;
  name: string;
  version: string;
  status: StrategyStatus;
  direction: string;
  timeframe: string;
  assetClass: string;
  firstRelease: boolean;
  eligible: boolean;
  executableConfigId: string | null;
  hash: string;
}

export function listRegistry(): RegistryRow[] {
  return STRATEGY_LIBRARY.map((s) => {
    const status = effectiveStatus(s);
    return {
      strategyId: s.strategy_id,
      name: s.name,
      version: s.version,
      status,
      direction: s.direction,
      timeframe: s.timeframe,
      assetClass: s.asset_class,
      firstRelease: (FIRST_RELEASE_IDS as readonly string[]).includes(s.strategy_id),
      eligible: status === "APPROVED" && s.executable !== null,
      executableConfigId: s.executable?.configId ?? null,
      hash: configHash(s),
    };
  });
}

export function registryStats() {
  const rows = listRegistry();
  return {
    total: rows.length,
    approved: rows.filter((r) => r.status === "APPROVED").length,
    eligible: rows.filter((r) => r.eligible).length,
    backtestRequired: rows.filter((r) => r.status === "BACKTEST_REQUIRED").length,
    draft: rows.filter((r) => r.status === "DRAFT").length,
    disabled: rows.filter((r) => r.status === "DISABLED").length,
    firstRelease: rows.filter((r) => r.firstRelease).length,
  };
}

/**
 * Resolve a registry strategy to an executable engine config id.
 * Throws STRATEGY_NOT_ELIGIBLE unless APPROVED + executable — the gate the
 * universe builder and every monitor start must pass (§2).
 */
export function resolveExecutable(id: string): { configId: string; hash: string; version: string } {
  const s = getStrategy(id);
  if (!s) throw new Error(`UNKNOWN_STRATEGY: ${id}`);
  const status = effectiveStatus(s);
  if (status !== "APPROVED" || !s.executable) {
    throw new Error(`STRATEGY_NOT_ELIGIBLE: ${id} is ${status}${s.executable ? "" : " (no executable mapping)"} — only APPROVED strategies with an executable mapping may trade autonomously (§2)`);
  }
  return { configId: s.executable.configId, hash: configHash(s), version: s.version };
}

/** Eligible (APPROVED + executable) strategies — the autonomous universe's menu. */
export function eligibleStrategies(): RegistryRow[] {
  return listRegistry().filter((r) => r.eligible);
}

/**
 * Operator kill: demote a strategy to DISABLED at runtime. This is the ONLY
 * runtime status mutation the engine permits. It is audited by the caller
 * (engine-router records it in the activity stream).
 */
export function disableStrategy(id: string): { ok: boolean; detail: string } {
  const s = getStrategy(id);
  if (!s) return { ok: false, detail: `unknown strategy ${id}` };
  runtimeDisabled.add(s.strategy_id);
  return { ok: true, detail: `${s.strategy_id} DISABLED by operator — effective immediately for new entries (open positions unaffected; exits stay with the trailing engine)` };
}

export function enableStrategy(id: string): { ok: boolean; detail: string } {
  const s = getStrategy(id);
  if (!s) return { ok: false, detail: `unknown strategy ${id}` };
  runtimeDisabled.delete(s.strategy_id);
  const status = effectiveStatus(s);
  return { ok: true, detail: `${s.strategy_id} restored to library status ${status}` };
}
