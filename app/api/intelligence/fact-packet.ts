/**
 * Phase B — Fact packet + Lucia gate (additive anti-hallucination).
 *
 * Code owns verified facts. When a turn is a hard data intent and no
 * deterministic handler produced a reply, we return WAIT — we do NOT let
 * Lucia invent prices, FCF, RVOL lists, or earnings screens.
 *
 * Existing deterministic handlers are unchanged; this only gates the LLM fallback.
 */
import type { GlobalIntent } from "./intent-firewall";
import { classifyGlobalIntent } from "./intent-firewall";

export type FactFieldStatus = "verified" | "calculated" | "WAIT" | "UNAVAILABLE";

export type FactField = {
  name: string;
  value: string | number | null;
  status: FactFieldStatus;
  source?: string | null;
};

export type FactPacket = {
  version: 1;
  intent: GlobalIntent;
  symbols: string[];
  asOf: string;
  sourceName: string | null;
  fields: FactField[];
  /** True when at least one field is verified/calculated. */
  hasVerifiedFacts: boolean;
};

/** Intents that must not fall through to free-form Lucia without a deterministic reply. */
const DETERMINISTIC_REQUIRED: ReadonlySet<GlobalIntent> = new Set([
  "MOVERS",
  "DISCOVERY",
  "GENERAL_MARKET",
  "DESK_COMPARE",
  "TECHNICALS",
  "HYP_PORTFOLIO",
  "EARNINGS_SCREEN",
  "EARNINGS_RESEARCH",
]);

export function requiresDeterministicFactPacket(intent: GlobalIntent): boolean {
  return DETERMINISTIC_REQUIRED.has(intent);
}

export function shouldBlockLuciaWithoutPacket(text: string): boolean {
  return requiresDeterministicFactPacket(classifyGlobalIntent(text));
}

export function buildFactPacket(input: {
  intent: GlobalIntent;
  symbols?: string[];
  sourceName?: string | null;
  fields?: FactField[];
  asOf?: string;
}): FactPacket {
  const fields = input.fields ?? [];
  return {
    version: 1,
    intent: input.intent,
    symbols: input.symbols ?? [],
    asOf: input.asOf ?? new Date().toISOString(),
    sourceName: input.sourceName ?? null,
    fields,
    hasVerifiedFacts: fields.some((f) => f.status === "verified" || f.status === "calculated"),
  };
}

/** Human reply when a data intent had no deterministic packet / handler output. */
export function formatNoPacketWaitReply(intent: GlobalIntent, text: string): string {
  const label = intent.replace(/_/g, " ").toLowerCase();
  return [
    `**${intent.replace(/_/g, " ")}: WAIT**`,
    "",
    `I classified this as a **${label}** ask, but no verified fact packet was produced from connected data layers.`,
    "",
    "I will **not** invent prices, volume ranks, fundamentals, earnings screens, or portfolio stress numbers.",
    "",
    "Status: **WAIT** — retry when market/data providers respond, or narrow the ask (e.g. name tickers for a desk compare / technicals).",
    "",
    `_Request kept for routing audit:_ ${text.trim().slice(0, 180)}`,
  ].join("\n");
}

/**
 * Stamp a fact packet onto a deterministic success result from meta + user text.
 * Additive — callers keep their existing reply text; packet is audit + future Lucia narration.
 */
export function stampFactPacketFromMeta(
  text: string,
  meta: {
    symbols?: string[] | null;
    sourceName?: string | null;
    timestamp?: string | null;
  },
  opts?: { fieldStatus?: FactFieldStatus },
): FactPacket {
  const intent = classifyGlobalIntent(text);
  const symbols = meta.symbols ?? [];
  const status = opts?.fieldStatus ?? "verified";
  return buildFactPacket({
    intent,
    symbols,
    sourceName: meta.sourceName ?? null,
    asOf: meta.timestamp ?? undefined,
    fields: [
      {
        name: "deterministic_handler",
        value: meta.sourceName ?? "deterministic",
        status,
        source: meta.sourceName ?? null,
      },
      ...(symbols.length
        ? symbols.slice(0, 24).map((s) => ({
            name: `symbol:${s}`,
            value: s,
            status,
            source: meta.sourceName ?? null,
          }))
        : []),
    ],
  });
}

/** Attach packet if missing; returns same object for chaining. */
export function ensureFactPacket<T extends { factPacket?: FactPacket; meta: { symbols?: string[] | null; sourceName?: string | null; timestamp?: string | null } }>(
  result: T,
  text: string,
): T {
  if (!result.factPacket) {
    result.factPacket = stampFactPacketFromMeta(text, result.meta);
  }
  return result;
}

/** Optional developer block when narrating a verified packet (Phase B+). */
export function factPacketDeveloperBlock(packet: FactPacket): string {
  const lines = [
    "=== VERIFIED FACT PACKET (narrate only — never invent beyond these fields) ===",
    `intent: ${packet.intent}`,
    `symbols: ${packet.symbols.join(", ") || "(none)"}`,
    `asOf: ${packet.asOf}`,
    `source: ${packet.sourceName ?? "n/a"}`,
    "fields:",
  ];
  if (!packet.fields.length) {
    lines.push("- (no field rows — treat all numbers as WAIT)");
  } else {
    for (const f of packet.fields) {
      const val = f.value === null || f.value === undefined ? "—" : String(f.value);
      lines.push(`- ${f.name}: ${val} [${f.status}]${f.source ? ` · ${f.source}` : ""}`);
    }
  }
  lines.push("If a field is WAIT/UNAVAILABLE, say so honestly. Do not fill gaps from memory.");
  return lines.join("\n");
}
