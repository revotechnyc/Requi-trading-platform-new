/**
 * Mock vs live mode for Massive + estimates vendors.
 * Mock when DATA_PROVIDER_MODE=mock, key missing, or key is DUMMY.
 */

export type DataProviderMode = "mock" | "live";

export function getDataProviderMode(): DataProviderMode {
  const raw = (process.env.DATA_PROVIDER_MODE ?? "").trim().toLowerCase();
  if (raw === "live") return "live";
  if (raw === "mock") return "mock";
  // Default: mock until real keys are pasted (safer for local/dev).
  return "mock";
}

export function isDummyKey(value: string | null | undefined): boolean {
  if (value == null) return true;
  const v = value.trim();
  if (!v) return true;
  return /^dummy$/i.test(v) || /^test$/i.test(v) || /^placeholder$/i.test(v);
}

/**
 * Resolve an API key. Returns null when callers should use mock or mark unavailable.
 * - mock mode → always null (use fixtures)
 * - live mode + missing/DUMMY key → null
 * - live mode + real key → key string
 */
export function resolveApiKey(envName: string): string | null {
  const raw = process.env[envName]?.trim() || null;
  if (getDataProviderMode() === "mock") return null;
  if (isDummyKey(raw)) return null;
  return raw;
}

/** True when this process should serve fixture data for paid research providers. */
export function isMockDataMode(envName?: string): boolean {
  if (getDataProviderMode() === "mock") return true;
  if (envName) return resolveApiKey(envName) === null;
  return (
    resolveApiKey("MASSIVE_API_KEY") === null &&
    resolveApiKey("ESTIMATES_API_KEY") === null
  );
}

export function estimatesVendor(): "factset" | "lseg" | "capiq" {
  const v = (process.env.ESTIMATES_VENDOR ?? "factset").trim().toLowerCase();
  if (v === "lseg" || v === "refinitiv") return "lseg";
  if (v === "capiq" || v === "capitaliq" || v === "spgi") return "capiq";
  return "factset";
}
