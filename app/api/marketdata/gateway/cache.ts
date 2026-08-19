/**
 * Gateway cache (spec §16) — in-process TTL cache so modules never stampede
 * a provider for identical data. Per-type TTLs, never one global TTL:
 *   live quote 5s · 1-minute candles 15s · daily history 6h · indicators 30s
 * (Redis can slot in behind this interface when the infra supports it.)
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export const CACHE_TTL = {
  quoteMs: 5_000,
  intradayMs: 15_000,
  dailyMs: 6 * 3_600_000,
  indicatorsMs: 30_000,
} as const;

export class TtlCache {
  private store = new Map<string, Entry<unknown>>();

  get<T>(key: string): T | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.value as T;
  }

  clear(): void {
    this.store.clear();
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    // Bound the cache; evict oldest on overflow.
    if (this.store.size > 2_000) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Read-through helper. */
  async through<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== null) return hit;
    const value = await loader();
    this.set(key, value, ttlMs);
    return value;
  }
}

export const gatewayCache = new TtlCache();
