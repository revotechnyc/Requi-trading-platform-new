import { createHmac } from "crypto";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { governanceDocuments, governancePackages } from "@db/schema";
import { compileGovernance } from "./compiler";
import { listVaultDocuments, sha256, vaultKey, vaultSealed } from "./vault";

/**
 * RUNTIME POLICY ENGINE
 *
 * The Autonomous Module operates ONLY on signed compiled packages. On load,
 * the active package's hash and HMAC signature are re-verified; a package
 * that fails verification cannot authorize anything.
 *
 * Minimum disclosure: the only projections that may leave this module for
 * users are safe fields (names, statuses, reason codes, plain-language
 * messages). Raw rules, thresholds, traces, and artifact JSON never leave.
 */

interface ActivePackage {
  id: string;
  version: string;
  hash: string;
  artifact: Record<string, Record<string, { value: unknown; status: string }>>;
}

let cache: ActivePackage | null = null;

function verifySignature(hash: string, signature: string): boolean {
  const expected = createHmac("sha256", vaultKey()).update(hash).digest("hex");
  return expected === signature;
}

/** Load and cryptographically verify the ACTIVE package. Throws if none/invalid. */
export async function loadActivePackage(): Promise<ActivePackage> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(governancePackages)
    .where(eq(governancePackages.status, "ACTIVE"))
    .orderBy(desc(governancePackages.id))
    .limit(1);
  if (!row) throw new Error("GOVERNANCE_UNAVAILABLE: no active compiled governance package");
  const hash = sha256(row.artifact);
  if (hash !== row.hash || !verifySignature(row.hash, row.signature)) {
    throw new Error("GOVERNANCE_INTEGRITY_FAILURE: active package signature verification failed — refusing to operate");
  }
  cache = { id: row.id, version: row.version, hash: row.hash, artifact: JSON.parse(row.artifact) };
  return cache;
}

function val(pkg: ActivePackage, fullKey: string): unknown {
  for (const pack of Object.values(pkg.artifact)) {
    if (pack[fullKey]) return pack[fullKey].value;
  }
  return undefined;
}

// ─── Deterministic runtime gates (minimum-disclosure outputs) ────────────────

export interface PreflightResult {
  ok: boolean;
  packageVersion: string;
  packageHashShort: string;
  checks: Array<{ key: string; pass: boolean }>;
  reasonCodes: string[];
}

/** Preflight the autonomous engine must pass before any loop may start. */
export async function runtimePreflight(input: { killSwitchArmed: boolean; accountReconciled: boolean; dataCurrent: boolean; brokerOperational: boolean }): Promise<PreflightResult> {
  const pkg = await loadActivePackage(); // throws → caller maps to GOVERNANCE_UNAVAILABLE
  const checks = [
    { key: "COMPILED_PACKAGE_SIGNATURE_VERIFIED", pass: true },
    { key: "STRATEGY_VERSION_ACTIVE", pass: true },
    { key: "ACCOUNT_RECONCILED", pass: input.accountReconciled },
    { key: "MARKET_DATA_CURRENT", pass: input.dataCurrent },
    { key: "BROKER_CONNECTION_OPERATIONAL", pass: input.brokerOperational },
    { key: "KILL_SWITCH_ARMED", pass: input.killSwitchArmed },
  ];
  const reasonCodes = checks.filter((c) => !c.pass).map((c) => c.key);
  return { ok: reasonCodes.length === 0, packageVersion: pkg.version, packageHashShort: pkg.hash.slice(0, 12), checks, reasonCodes };
}

export type AuthorityZone = 1 | 2 | 3;

/** ICOS Volume XVI — classify any contemplated action into an authority zone. */
export function classifyAuthority(action: { increasesRisk: boolean; reducesRiskOnConfirmedPosition: boolean; tighteningOnly: boolean }): { zone: AuthorityZone; permitted: boolean; reasonCode: string } {
  if (action.increasesRisk) {
    return { zone: 2, permitted: false, reasonCode: "EXACT_CONFIRMATION_OF_CURRENT_TICKET_REQUIRED" };
  }
  if (action.reducesRiskOnConfirmedPosition) {
    return action.tighteningOnly
      ? { zone: 3, permitted: true, reasonCode: "AUTONOMOUS_RISK_REDUCTION_PERMITTED" }
      : { zone: 3, permitted: false, reasonCode: "WIDENING_OR_EXPOSURE_INCREASE_REJECTED" };
  }
  return { zone: 1, permitted: true, reasonCode: "AUTONOMOUS_OBSERVATION_PERMITTED" };
}

/** Confirmation-gate validation — the only valid authorization artifacts. */
export async function validateConfirmationString(raw: string, currentTicketId: string): Promise<{ authorized: boolean; reasonCode: string }> {
  await loadActivePackage();
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized === `CONFIRM ORDER ${currentTicketId.toUpperCase()}`) {
    return { authorized: true, reasonCode: "CONFIRMED_CURRENT_TICKET" };
  }
  if (normalized.startsWith("CONFIRM ORDER")) {
    return { authorized: false, reasonCode: "STALE_OR_MISMATCHED_TICKET" };
  }
  return { authorized: false, reasonCode: "INVALID_CONFIRMATION_FORMAT" };
}

/** Post-fill stop adjustment — tightening-only, auto-enforced (CB 6). */
export function validateStopAdjustment(currentStop: number, proposedStop: number, side: "BUY" | "SELL"): { permitted: boolean; reasonCode: string } {
  const tightens = side === "BUY" ? proposedStop > currentStop : proposedStop < currentStop;
  if (proposedStop === currentStop) return { permitted: true, reasonCode: "STOP_UNCHANGED" };
  return tightens
    ? { permitted: true, reasonCode: "TIGHTENING_ONLY_PERMITTED" }
    : { permitted: false, reasonCode: "WIDENING_STOP_REJECTED_CB6" };
}

/** Rescan cadence guard — looser overrides are constitutionally void. */
export async function validateRescanCadence(strategy: "intraday" | "earnings", proposedMinutes: number): Promise<{ valid: boolean; appliedMinutes: number; reasonCode: string }> {
  const pkg = await loadActivePackage();
  const ceilings =
    strategy === "intraday"
      ? { max: (val(pkg, "rescan.cadence.intradayMinutes") as number) ?? 5 }
      : { max: Math.max(...(((val(pkg, "rescan.cadence.earningsMinutes") as number[]) ?? [10, 15]))) };
  if (proposedMinutes <= ceilings.max) {
    return { valid: true, appliedMinutes: proposedMinutes, reasonCode: "TIGHTER_OR_EQUAL_OVERRIDE_PERMITTED" };
  }
  return { valid: false, appliedMinutes: ceilings.max, reasonCode: "LOOSER_OVERRIDE_VOID_CONSTITUTIONAL_CEILING_APPLIED" };
}

/** Six-layer signal qualification (Appendix F): failure ⇒ remains a signal. */
export function qualifySignal(input: { regimeOk: boolean; liquidityOk: boolean; flowOk: boolean; riskOk: boolean; evPositiveAfterCosts: boolean; executionOk: boolean }): { qualified: boolean; failedLayers: string[]; reasonCode: string } {
  const layers: Array<[string, boolean]> = [
    ["REGIME", input.regimeOk],
    ["LIQUIDITY", input.liquidityOk],
    ["FLOW", input.flowOk],
    ["RISK", input.riskOk],
    ["EV", input.evPositiveAfterCosts],
    ["EXECUTION", input.executionOk],
  ];
  const failedLayers = layers.filter(([, ok]) => !ok).map(([name]) => `${name}_BELOW_REQUIREMENT`);
  return failedLayers.length === 0
    ? { qualified: true, failedLayers: [], reasonCode: "ALL_QUALIFICATION_LAYERS_PASSED" }
    : { qualified: false, failedLayers, reasonCode: "SIGNAL_REMAINS_SIGNAL_NO_TRADE" };
}

// ─── Minimum-disclosure projections (safe to send to clients) ────────────────

/** Operator-safe package status — versions and hashes, never artifact content. */
export async function publicPackageStatus() {
  const db = getDb();
  const rows = await db.select().from(governancePackages).orderBy(desc(governancePackages.id)).limit(10);
  return rows.map((r) => ({
    id: r.id,
    version: r.version,
    hashShort: r.hash.slice(0, 12),
    signatureShort: r.signature.slice(0, 12),
    status: r.status,
    createdAt: r.createdAt,
    activatedAt: r.activatedAt,
  }));
}

export async function documentRegistry() {
  const db = getDb();
  const rows = await db.select().from(governanceDocuments);
  return rows.map((d) => ({ docKey: d.docKey, title: d.title, version: d.version, sha256Short: d.sha256.slice(0, 12), status: d.status, registeredAt: d.registeredAt }));
}

/** Sync the encrypted vault into the document registry, then ensure a signed ACTIVE package exists (genesis compile on first boot). */
export async function ensureGovernanceReady(): Promise<void> {
  if (!vaultSealed()) {
    console.warn("[governance] vault not sealed — governance compiler inactive");
    return;
  }
  const db = getDb();
  for (const entry of listVaultDocuments()) {
    await db
      .insert(governanceDocuments)
      .values({ docKey: entry.docKey, title: entry.title, version: entry.version, sha256: entry.sha256, status: "AUTHENTICATED" })
      .onConflictDoUpdate({ target: governanceDocuments.docKey, set: { title: entry.title, version: entry.version, sha256: entry.sha256 } });
  }
  const [active] = await db.select({ id: governancePackages.id }).from(governancePackages).where(eq(governancePackages.status, "ACTIVE")).limit(1);
  if (active) return;
  try {
    const compiled = await compileGovernance({ approvedBy: "genesis-bootstrap" });
    await db.insert(governancePackages).values({
      version: compiled.version,
      hash: compiled.hash,
      signature: compiled.signature,
      status: "ACTIVE",
      artifact: compiled.artifact,
      report: JSON.stringify(compiled.report),
      activatedAt: new Date(),
    });
    console.log(`[governance] genesis package ${compiled.version} compiled, signed, and activated (${compiled.report.rulesCompiled} rules)`);
  } catch (e) {
    console.error(`[governance] genesis compilation blocked: ${(e as Error).message}`);
  }
}
