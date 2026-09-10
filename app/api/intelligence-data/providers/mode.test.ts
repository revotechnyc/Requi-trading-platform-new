import { afterEach, describe, expect, it } from "vitest";
import {
  estimatesVendor,
  getDataProviderMode,
  isDummyKey,
  isMockDataMode,
  resolveApiKey,
} from "./mode";

const KEYS = ["DATA_PROVIDER_MODE", "MASSIVE_API_KEY", "ESTIMATES_API_KEY", "ESTIMATES_VENDOR"] as const;

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("research provider mode", () => {
  it("T0.1 treats DUMMY / missing as mock-friendly null keys", () => {
    expect(isDummyKey("DUMMY")).toBe(true);
    expect(isDummyKey("")).toBe(true);
    expect(isDummyKey(null)).toBe(true);
    expect(isDummyKey("real-secret-key")).toBe(false);

    process.env.DATA_PROVIDER_MODE = "mock";
    process.env.MASSIVE_API_KEY = "DUMMY";
    expect(resolveApiKey("MASSIVE_API_KEY")).toBeNull();
    expect(isMockDataMode("MASSIVE_API_KEY")).toBe(true);
  });

  it("T0.2 live + empty key → unavailable path (null), no throw", () => {
    process.env.DATA_PROVIDER_MODE = "live";
    delete process.env.ESTIMATES_API_KEY;
    expect(getDataProviderMode()).toBe("live");
    expect(resolveApiKey("ESTIMATES_API_KEY")).toBeNull();
    expect(isMockDataMode("ESTIMATES_API_KEY")).toBe(true);
  });

  it("live + real key resolves the key", () => {
    process.env.DATA_PROVIDER_MODE = "live";
    process.env.MASSIVE_API_KEY = "pk_live_abc123";
    expect(resolveApiKey("MASSIVE_API_KEY")).toBe("pk_live_abc123");
    expect(isMockDataMode("MASSIVE_API_KEY")).toBe(false);
  });

  it("parses estimates vendor", () => {
    process.env.ESTIMATES_VENDOR = "lseg";
    expect(estimatesVendor()).toBe("lseg");
    process.env.ESTIMATES_VENDOR = "capiq";
    expect(estimatesVendor()).toBe("capiq");
  });
});
